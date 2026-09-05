// ==UserScript==
// @name         Pine & Co Auto Survivor
// @namespace    https://pineandco.online/
// @version      6.132.2
// @description  Autonomous player for Pine & Co. Reads the game's real internals (lexical globals + exported functions), plans movement on true coordinates, dodges projectiles / drop marks / dash lanes, and drives every menu through the game's own API. Optimises for TIME + DOWNS + SALES and pushes toward super cocktails and the Rainbow Gun. Stops on a Hell-mode high score so you can type your own name.
// @author       you
// @match        https://pineandco.online/*
// @match        https://www.pineandco.online/*
// @match        http://pineandco.online/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/changhakim90/pine-bot/main/dist/pine-bot.user.js
// @downloadURL  https://raw.githubusercontent.com/changhakim90/pine-bot/main/dist/pine-bot.user.js
// ==/UserScript==

/* =====================================================================
 * THE MASTER STRATEGY (in priority order, per the user):
 *   1. KILL — kite the swarm, siege walls, engage bosses at the firing ring
 *   2. HARVEST — passouts, gold, and items fund everything
 *   3. UPGRADE — measured-best weapons, purpose-matched to the field
 *   4. HELL — survive the 20-minute day, always take AFTER-HOURS
 *   5. RAINBOW — six supers ASAP, then the gun
 *   6. EVOLVE — rbstat growth outranks everything once the gun exists
 *   7. ITEMS — timestop/firecross/tequila by need, heals always when hurt
 *   8. SURVIVE LONGEST — deep-hell reward gradient aims at rank #1
 * =====================================================================
 * THE REWRITE THAT ACTUALLY TALKS TO THE GAME
 * ---------------------------------------------------------------------
 * The game's script is a plain classic <script> with no IIFE. That means
 * its `let player, enemies, ...` live in the GLOBAL LEXICAL ENVIRONMENT
 * (not on window), while its top-level `function` declarations DO land on
 * window. Every earlier version looked for `window.player`, found nothing,
 * and fell back to pixel-scanning — which is why it moved badly and could
 * not read level-up cards.
 *
 * With @grant none the userscript runs in the page realm, so a bare
 * reference to `player` inside a try/catch resolves through the scope
 * chain straight to the game's binding. This version does that, and calls
 * the game's own functions (startGame, pickUpgrade, ...) instead of
 * guessing at DOM buttons. DOM heuristics remain as a fallback only.
 * =====================================================================
 * v6.80.0 — VERSION SNAPSHOTS
 * ---------------------------------------------------------------------
 * Every version's per-run rollup (learn.versions) now also keeps its top-5
 * runs. The moment a NEW script version first loads, the previous version's
 * rollup is FROZEN into learn.snapshots — a permanent record that keeps
 * existing even if the rollup is later reset. pineBot.compare() (and the
 * 📸 panel button) merges live rollups + frozen snapshots into one table,
 * ordered by release, with deltas against the previous version — so
 * "which version performs best?" is answered from data, not memory.
 * ---------------------------------------------------------------------
 * v6.81.0 — HONEST COMPARISON STATS + SUPER COUNT FIX
 *   * each version keeps its survival-time list, so the table reports
 *     MEDIAN, SD, standard error, and the share of runs past 60 / 120 min
 *     (P60 / P120). Best-time is a lottery that scales with run count;
 *     these are what actually separate two rulebooks.
 *   * vsPrev carries a z-score for the mean-time difference: |z| < 2 means
 *     the gap is still noise.
 *   * supersThisRun counted every SUPER card (levels included) — long runs
 *     logged 9-13 "supers" against a 5-super cap. It now counts UNLOCKS.
 * ---------------------------------------------------------------------
 * v6.82.0 — DEEP-HELL CONTACT POSTURE (the crown is 4 minutes away)
 *   The crown profile produced 249:00 and 246:49 runs against a 252:30
 *   board; both — and every top-5 run — ended on CONTACT in deep hell
 *   (68% of all deaths). Nothing in the pick rules touches that. Past the
 *   2-hour mark the posture now hardens with depth: wider boss contact
 *   bands, a longer contact-prediction horizon, a faster dash gate, and
 *   the ult spent on imminent contact. Day phase and early hell are
 *   untouched — that is where the crown profile already wins.
 *   Also: the FIFTH super. Top runs finish with 4; the key ingredient of
 *   a maxed plan cocktail now jumps the queue in hell while a slot is open.
 * ---------------------------------------------------------------------
 * v6.83.0 — THE FIFTH SUPER IS GINGER BEER (hell only)
 *   6.82's fifth-super push could not work: the plan's completable lines
 *   are SOUTH SIDE (MINT), GIN TONIC + VODKA TONIC (TONIC), NEGRONI
 *   (CAMPARI) — FOUR. LEMON, GINGER BEER and ORANGE were all banned, so
 *   four was the structural ceiling. Results (6.82.0+crown, 192 runs):
 *   253:30 (crown beaten, unsaved by choice), 240:45, 219:46 — every one
 *   a MOSCOW MULE / NEGRONI primary, every one ended by CONTACT with 4
 *   supers. MOSCOW MULE's super is the knockback whip — the direct counter
 *   to that death. So once a run is in hell, GINGER BEER leaves the avoid
 *   list and joins the ingredient plan: SUPER MOSCOW MULE becomes the
 *   fifth line. Five is still safe — the gun gate is six MAXED supers and
 *   the gun-guard refuses a sixth regardless. Day phase untouched.
 * ---------------------------------------------------------------------
 * v6.84.0 — SUPERS ARE NOT THE LEVER; KNOCKBACK AND MARKS ARE
 *   112 runs of 6.83.x refuted the fifth-super theory: supersPerRun stayed
 *   at 1.4-1.6, and the two best runs EVER — 255:48 (run 4177, VODKA
 *   CRANBERRY primary) and 253:31 (run 4178, GIN TONIC) — finished with
 *   THREE supers each. The only 5-super run lasted 49 minutes. More supers
 *   is not what produces depth.
 *   What DOES keep showing up at the top is knockback: VODKA CRANBERRY and
 *   MOSCOW MULE lead four of the all-time top runs, and both gain their
 *   shove at LEVEL 6 — no super required. So:
 *     * the 6.82 fifth-super bonuses are removed as dead weight,
 *     * finishing a knockback cocktail to Lv6 becomes a first-class goal,
 *       scaled by proximity to 6 and by how much contact is killing us,
 *     * marks — 27% of 6.83.1 deaths, up from 21% — get depth-scaled
 *       avoidance to match the deep-hell contact posture.
 *   GINGER BEER stays unbanned in hell: it is MOSCOW MULE's key, and while
 *   its super no longer looks decisive, the cocktail itself does.
 * ---------------------------------------------------------------------
 * v6.85.0 — PER-BARTENDER LEARNING + THE PAT EXPERIMENT
 *   DIFF() sampled across a run (live, 2026-08-21):
 *       t(s)     hp        speed   spawn  dmg
 *       0        16        0.5     54     5.1
 *       600      1.25e3    1.6     8      22.39
 *       3600     1.03e7    25.1    8      22.39
 *       15300    5.57e17   403.4   8      22.39
 *   DAMAGE IS FLAT FROM MINUTE 10. Spawn caps at 8. Only HP (x1.4/180s)
 *   and SPEED (~quadratic, 403 px/frame at 255 min vs a player at ~3)
 *   keep growing. So past minute ten the deep game is a STATIONARY
 *   damage regime gated by the 38-frame invuln window: survival is max
 *   HP, armor, shield, ult uptime and heal income. Speed is irrelevant —
 *   which is minguk's entire premise (120 HP, 2.375 speed, "outrun
 *   everything"). PAT has 180 HP (1.9 speed, SHAKING splash); JOE 100 HP
 *   (3.0, STIRRING). The hell board's top ten is 9x Pat. Pat has never
 *   been run with this bot.
 *   So: learned state (CEM, item/build/roster bandits, LinUCB, hof,
 *   history) is now NAMESPACED BY BARTENDER — Pat learns from scratch and
 *   cannot contaminate minguk's ~600 runs of tuning or vice versa —
 *   while versions/snapshots stay SHARED so compare() shows the
 *   bartenders side by side. The bartender is part of the version tag
 *   (6.85.0+crown+pat). A small CHAR profile adjusts what the fixed
 *   rules cannot learn: tank posture (kite less, anchor more, panic
 *   later) and a mitigation tilt in the scorer. Everything else is
 *   shared and the optimizer does the rest.
 * ===================================================================== */

(function () {
    'use strict';

    // Single source of truth for the version. Stamped onto every run record so
    // versions can actually be compared, and shown in the panel.
    const SCRIPT_VERSION = '6.132.2';
    // Bump ONLY when computeReward's scale changes. Rewards from different
    // epochs cannot be compared, so a bump clears the reward-derived baselines.
    // v6.91.6 EPOCH 3. Two scale changes, one of them not ours:
    //   1. Seeding the 6.74.0 crown row at 11:11 on 2026-08-26 put the user's
    //      own 62686s (17.4h) manual run into `paco_bdh_time`. hellTimeBonus
    //      divided by that live number, so the dominant deep-run reward term
    //      (crownProgress, weight 2.0 — eight times hellDepth) was cut 4.1x
    //      MID-MEASUREMENT, with no epoch bump and no code change. A 6000s run
    //      was worth 0.792 of crown progress on 25 Aug and 0.191 on 26 Aug.
    //   2. This version decouples that term from the live board (below).
    // Either alone requires the bump; the first one had already happened
    // silently, which is exactly what the epoch counter exists to prevent.
    // v6.108.0 -> 4: `milestones.immortal` changes the reward SHAPE, so rows
    // from epoch 3 are not comparable. Wipes hof/genHistory/history; keeps
    // the CEM mean/sigma and every bandit stat.
    const REWARD_EPOCH = 4;

    // =================================================================
    // CONFIG
    // =================================================================
    const CONFIG = {
        debug: true,
        tickMs: 33,               // planner tick (movement re-plan cadence)
        overlayMs: 260,           // menu / state-machine cadence
        autoStart: true,
        // MINGUK BUILD (user pivot): fast (2.375 speed), light (120 HP),
        // AGAVE base attack. Doctrine: NO rainbow chase — maxed SOUTH SIDE +
        // OLIVE + NEGRONI + TIME STOP extensions, stall hell with time
        // pauses, wipe holdouts with the ultimate, and outrun everything on
        // natural speed (the planner reads his speed live: kiting, chase
        // prediction, and chaserFast thresholds all scale automatically).
        // v6.85.0 BARTENDER SELECTION. Each bartender has its OWN learned
        // state and its OWN rows in compare(), so nothing here loses data.
        //   preferredBartender: 'pat' | 'joe' | 'minguk'  -> always that one
        //   preferredBartender: null + bartenderRotation  -> alternate per run
        //   both null/empty                               -> learned bandit
        // v6.87.1 (user directive): PIN MINGUK. Rotation off after one release.
        // He is the better character on every number that exists — median
        // 21.9m against pat's 15.4m over ~4,200 runs vs 116 — and he is the
        // one who competed for the crown, so the whole sample rate goes to
        // him rather than being split with a profile that has never matched
        // him. The 6.87.0 per-character work is NOT wasted by this: pat's
        // roster and posture stay encoded and correct, and re-pinning him or
        // restoring the rotation is a one-line change either way.
        // What this pin means for reading the numbers: minguk's row is the
        // only one that will move, and it starts from a store the 6.86.0
        // repair reopened, so expect wide sampling before it settles.
        //
        // v6.86.11 (superseded): ROTATE PAT / MINGUK. The pin below
        // was lifted — `preferredBartender: null` hands selection to
        // `bartenderRotation`, which alternates run by run and is persisted in
        // localStorage `pineBotRotIdx`, so it survives reloads mid-sequence.
        // Each bartender keeps its OWN CEM store (`pineBotUCB_v5_pat` /
        // `_minguk`) and its own `compare()` rows, so this costs no history and
        // gives a CONCURRENT control instead of the historical one: everything
        // shipped since 6.86.2 was measured against minguk runs from a
        // different fortnight of the meta.
        // Halves the sample rate per character — expect ~2x the runs before a
        // z-score on either row means anything.
        // The 6.86.x doctrine is already per-character and needs no rework:
        // the tank bonuses all gate on `charOf().style === 'tank'` (minguk is
        // a runner, so first-super / ult-spine / armour-early / TOMATO JUICE /
        // mitigation are inert for him), and the ult doctrine reads `ultKind`
        // — minguk's `nuke` clears passouts at ANY range and never consults
        // `ultAdjacent`, which is pat's melee-spray gate.
        // v6.85.3 (superseded): PIN PAT. No rotation.
        // 6.85.2 had pat/minguk alternating so minguk acted as a live control.
        // That is now dropped in favour of sample rate: every run lands on the
        // freshly recalibrated tank, so his median/day-clear/mark-share move
        // twice as fast against the 6.85.1 baseline (925s / 0.31 / 37%).
        // The cost is real and worth remembering — minguk is currently the
        // BETTER character (median 21.9m vs Pat's 15.4m), so while this is
        // pinned every run is on the weaker profile and crown odds are lower.
        // minguk still has ~600 runs of history to compare against, so the
        // control is historical rather than concurrent.
        // To rotate again: set preferredBartender back to null. The rotation
        // list below is inert while a bartender is pinned.
        //
        // v6.93.2 (user): "Let's try to rotate between pat and joe in the
        // latest build instead of minguk." The minguk pin is LIFTED and the
        // rotation set to pat/joe — the two characters whose early game the
        // 6.93.1 harvest approach was built for. Minguk is not deleted: his
        // store, rows, and posture stay intact, and re-pinning him is this
        // same one-line change back. What this costs, stated plainly:
        // minguk's row (the 120-minute-consistent baseline) stops
        // accumulating, and the sample rate halves per character — expect
        // ~2x the runs before a z on either row means anything. Each keeps
        // its OWN CEM store (pineBotUCB_v5_pat / _joe) and its own
        // compare() rows, so nothing is polluted. NOTE: the 6.93.0 runaway
        // clamp applies per store on load, so whatever state the pat/joe
        // stores are in, their means are pulled into the current box the
        // first time they load.
        //
        // v6.96.0 (user): "since we know pat can do this strategy now more
        // consistently, can we try to just optimize for joe only". Pat's
        // deep-hell doctrine is PROVEN — run 4589 on 6.95.0 booked 13,244 s
        // (220 min, ₩219.6M, ended only by the user's own hand) — so pat
        // stops consuming sample rate and the whole run budget goes to the
        // character the doctrine has NOT yet carried. Joe's 6.95.1 fragile
        // profile and the 6.95.2 entry ramp have exactly 1 booked run
        // between them; a pin is how that reaches n=20 fastest. The
        // rotation list stays intact below — restoring pat/joe is this
        // same one-line change back, as it was for minguk.
        preferredBartender: 'joe',
        bartenderRotation: ['pat', 'joe'],

        // v6.125.0 THE IMMORTAL STOP RULE (user, 2026-09-03, standing):
        //
        //   "Each time I run a batch:
        //    1. Check if joe has hit 5 immortal builds (doesn't die,
        //       completes corner anchoring, early cap triggers)
        //    2. If yes -> stop training joe, move to minguk
        //    3. Same criterion for minguk -> when it hits 5, move to pat
        //    4. Same for pat"
        //
        // v6.126.0 — A COUNT, NOT A STREAK. User: "let's not make it 5
        // consecutive immortal builds but just 5 as a count of immortal
        // builds as a target." 6.125.0 read the bar as five IN A ROW with any
        // death resetting it; the bar is now five immortal builds in TOTAL
        // on the character's own tag, deaths in between neither reset nor
        // count. The count is PERSISTED in the graduation store the run it is
        // earned (finishRun), because the phase audit is a rolling 240-row
        // window and a count read off the rows alone would quietly shrink as
        // old immortal rows evict. The live figure is the larger of the
        // persisted counter and the immortal rows still in the audit, so
        // rows booked under 6.125.0 (before the counter existed) are not
        // lost on upgrade.
        //
        // This is that rule as code, so it fires the run it becomes true and
        // not the next time someone reads a report. A pin (`preferredBartender`
        // above) is honoured until the pinned character GRADUATES; then the
        // pin advances to the next character in `order` that has not. The
        // graduation is persisted (`pineBotGraduation`, namespaced like every
        // other store) so a reload does not send a graduate back to work, and
        // the report carries `graduation` so a paste says who is where.
        //
        // WHAT "IMMORTAL" MEANS, in phase-row fields, one predicate
        // (isImmortalRow in 04) so it can be asserted:
        //   cap:true, capAt < deepHell.runCapS  -> the EARLY cap fired, not
        //                                          the 150-minute clock
        //   why !== 'saturated'                 -> the STABLE-BUILD arm
        //                                          (HP/def/supers held
        //                                          holdS), not the deadlock
        //                                          arm
        //   parkT > 0                            -> corner anchoring happened
        // A capped run is by construction one that did not die on its own —
        // the ladder ends it.
        //
        // `order` is the user's sequence. A character not in it is never
        // auto-advanced to. `count: 0` or `enabled: false` disables the rule
        // without touching the pin. pineBot.ungraduate(c) also zeroes c's
        // counter, so a character sent back to work starts a fresh set.
        //
        // v6.128.0 THE RESET (user, standing): "In the next build I want to
        // rotate among pat, minguk, and joe and have all their immortal
        // build count reset and start from the new version. They should
        // reach 10 immortal build counts." Two changes: the bar is now TEN,
        // not five; and every character's persisted count and graduated
        // flag is cleared once, the first time this version's code runs
        // (the `graduation` store's one-time migration below, guarded by
        // `resetEpoch128`). The reset also stamps
        // `graduation.immortalEpochVersion` with the version that performed
        // it, and `immortalRowsCount` (04) ignores any phase-audit row
        // tagged with an EARLIER version — otherwise a pre-reset immortal
        // row still sitting in the rolling 240-row audit window would
        // silently re-inflate the freshly-zeroed counter back toward its
        // old value on the very first report after upgrading. The
        // joe -> minguk -> pat rotation itself (`order` below) is
        // unchanged — it already IS "rotate among pat, minguk, and joe",
        // just under a fresh count and a clean floor.
        //
        // v6.130.0 ROTATE PER RUN (user): "Let's restart the immortal build
        // process again with Joe, Minguk, and Pat by resetting the counter
        // and starting from 0 with the goal to getting to 10. For this
        // version, let's rotate the character per run instead of sticking
        // with one character until it reaches the 10 immortal build count."
        // And, correcting the first cut (which took a graduate out of the
        // cycle): "no I want them to rotate on every session regardless of
        // whether they graduated."
        // Two changes. (1) A second one-time reset (`resetEpoch130` in the
        // store init below): every count and graduation wiped, the floor
        // re-stamped at this version, so rows booked under 6.128.x/6.129.x
        // do not count toward the fresh ten. (2) `rotate: true` — the pick
        // is a plain ROUND-ROBIN over `order`, one step every run start,
        // persisted (`graduation.lastPlayed`) so a reload mid-sequence
        // continues rather than restarts, and it never skips anyone:
        // reaching ten is recorded (graduation, the 🎓 in the summary) as
        // the goal being measured, but a graduate keeps playing. `rotate:
        // false` restores the pin-until-graduated behaviour unchanged.
        // Note this splits the per-character SAMPLE RATE three ways (each
        // compare row moves a third as fast; expect ~3x the runs before a
        // z means anything) — but not the LEARNING: since 6.127.0 the
        // CEM/bandit skill is one shared store, so every run improves all
        // three regardless of who played it. `preferredBartender` is inert
        // while `rotate` is on.
        graduation: {
            enabled: true,
            count: 10,
            order: ['joe', 'minguk', 'pat'],
            rotate: true
        },

        // USER-PRESCRIBED ROADMAP (overrides self-composition while set; set
        // to null to return to data-derived rosters).
        //
        // v6.127.0 (user, correcting a stale comment this block used to carry):
        // "Joe, Pat, and Minguk should have similar roadmaps. I trained on Joe
        // because it was the weakest character with the assumption that if I
        // built the script for Joe, it should be easy for Pat and Minguk."
        // That IS the shipped doctrine — charRoadmap.joe/.pat/.minguk (below)
        // are deliberately identical. An earlier version of this comment block
        // described a Pat-only build (VODKA MARTINI -> DRY VERMOUTH super,
        // BLACK VERMOUTH, gatling+flame offense) that was never actually wired
        // into charRoadmap.pat and does not exist in the shipped config — it
        // documented a direction that got abandoned when the shared roadmap
        // won out, and it misled analysis into thinking the divergence was a
        // bug. It was not; the single roadmap below IS the design.
        //
        // MOJITO promoted to full roster member (SUGAR key), VODKA CRANBERRY
        // retired. Every super key covered by this roster:
        //   VODKA TONIC/GIN TONIC->TONIC (shared)   SOUTH SIDE->MINT
        //   NEGRONI->CAMPARI (no super, rides on raw effect)
        //   MOJITO->SUGAR
        // CAPPED AT FIVE completable supers by design (roster-cap test
        // enforces it): GIN TONIC + VODKA TONIC share one TONIC key, WHISKY
        // SOUR's LEMON stays banned, so the six-super Rainbow Gun gate can
        // never trigger and level-up pools keep offering the time-pause
        // extensions instead — for all three characters alike.
        //
        // What actually DOES differ per character (see CHARS below and
        // charOf().mitigationTilt in 03-scoring.js): physical stats (HP,
        // speed), posture (kiteMul/anchorBias/panicMul/dayRing/kiteChasers/
        // fleeNear), ultimate kind/reach/falloff, and — once each bartender
        // has enough of their OWN runs — their separately-namespaced learned
        // priorities (cocktailPriority()/ingredientPriority() in 02-learning,
        // learn.builds/learn.items keyed per bartender). The weapon/ingredient
        // POOL itself is intentionally shared.
        userRoadmap: {
            cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'MOJITO', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'],
            ingredients: ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CRANBERRY', 'SUGAR', 'WATER', 'COFFEE BEANS']
        },

        // v6.87.0 PER-CHARACTER ROADMAPS (user: "they should have had
        // different characteristics encoded on them though they share some
        // similarities on weapon and ingredients roster").
        //
        // Until now `userRoadmap` above was the ONE roster for whoever was
        // playing — and it is the MINGUK STALL roster. Pat has been building
        // minguk's plan for every run since 6.85.2, which is why the comment
        // block above describes a Pat build that the list underneath it never
        // contained. Most conspicuously VODKA MARTINI was absent, so the
        // super the user named as Pat's whole DPS answer ("his DPS is low
        // without a super cocktail like vodka martini") could never be built.
        //
        // SHARED CORE — both characters want these, for different reasons:
        //   SOUTH SIDE (MINT)  zone damage; the only thing that reliably
        //                      hurts stationary holdouts and paused bosses
        //   NEGRONI (CAMPARI)  mitigation; the survival pair with OLIVE
        //   OLIVE, CRANBERRY   armour, and lv6 knockback without spending a
        //                      super slot on it
        //
        // THE FIVE-SUPER CAP IS DELIBERATE AND MUST HOLD FOR BOTH. The
        // Rainbow Gun's gate is six MAXED supers; a roster that can only ever
        // complete five can never open it, which is the structural version of
        // the 6.86.9 ban rather than a scoring veto that a bad pool can beat.
        // Count completable supers as cocktails whose SUPER_KEY_INGREDIENT is
        // in that character's ingredient plan (GIN TONIC and VODKA TONIC share
        // TONIC; LEMON and ORANGE are permanently banned; GINGER BEER unbans
        // only in hell). Both rosters below sit at five. The `roster-cap`
        // test asserts it, so a future addition cannot quietly open the gate.
        // v6.88.3b (user): "the build roster can now have 4 super cocktails
    // assuming southside is still on it". FOUR lines, and they are exactly the
    // four the 373-minute run finished with:
    //   SOUTH SIDE->MINT   VODKA TONIC->TONIC   GIN TONIC->TONIC   MOJITO->SUGAR
    // Three keys cover four lines because TONIC is shared.
    //
    // "whisky sour, negroni, vodka cranberry should be massively boosted
    // despite not having super key" — these three ride at Lv6 as plain
    // cocktails and earn their slot on raw effect, so CRANBERRY leaves the
    // ingredient plan deliberately: keeping it would make VODKA CRANBERRY a
    // FIFTH super line and re-open the gun gate. NEGRONI has no CAMPARI and
    // WHISKY SOUR's LEMON never unbans, so both are already keyless by
    // construction; the cranberry now joins them on purpose.
    //
    // COSMOPOLITAN dropped: its key is ORANGE (permanently banned), it never
    // appeared in the 373-minute build, and a cocktail that can neither super
    // nor earn a boost is just a spent slot.
    // v6.88.3 ROSTER — corrected against a LIVE 373-MINUTE PAT RUN (gt 22402,
    // 121 minutes past the 252:30 crown, 441/441 HP). Read straight off the
    // player object rather than argued from source:
    //   weapons  gintonic:6 mojito:6 moscowmule:6 negroni:6 southside:6
    //            vodkatonic:6 whiskysour:6 + coffee lime soda sugar water
    //            mint olive tomato tonic cranberry dryver sweetver, all Lv6
    //   supers   vodkatonic:6 gintonic:6 mojito:6 southside:6   (FOUR, not five)
    //   crafts   syrup + blackver, both absorbed
    //   NO CAMPARI at all — which is why that run's NEGRONI sat at Lv6 and
    //   never supered, and it did not matter.
    //
    // Three corrections follow, at the user's direction:
    //   +MOJITO       — the config excluded it ("SUGAR = pure luck stat") while
    //                   the deepest run in the project's history is carrying
    //                   SUPER MOJITO. SUGAR is also its super key, and SUGAR is
    //                   already planned for SIMPLE SYRUP.
    //   +COFFEE BEANS — `reviveCharges: 1` in that run. An extra life. It was
    //                   sitting in AVOID_INGREDIENTS_BASE while the roster
    //                   comment two hundred lines away valued it at 26.
    //   -CAMPARI      — absent from the winning build; NEGRONI stays for the
    //                   dodge/shield and is simply not a super line any more.
    //
    // VODKA CRANBERRY is KEPT over MOSCOW MULE (user), against that run's own
    // evidence. Recorded plainly: the 373-minute build carries the mule.
    //
    // Super-line count is unchanged at exactly five, so the six-super Rainbow
    // Gun gate still cannot open: SOUTH SIDE(MINT) VODKA TONIC(TONIC)
    // GIN TONIC(TONIC) VODKA CRANBERRY(CRANBERRY) MOJITO(SUGAR). NEGRONI loses
    // CAMPARI, WHISKY SOUR's LEMON and COSMOPOLITAN's ORANGE never unban, and
    // COFFEE BEANS' cocktail (ESPRESSO MARTINI) is off-roster.
    // v6.88.2 (user): "fix the day phase so joe and pat have the items
        // from this run and have the same setup running into deep hell mode".
        //
        // 6.87.0 split the roster per character on the reasoning that a tank
        // and a runner want different builds. That reasoning was about the DAY,
        // where the characters really do play differently — but the deep game
        // they are all trying to reach is identical, and it is the deep game
        // the crown lives in. Splitting the roster meant pat and joe arrived at
        // minute 150 holding a different build from the one the deep posture
        // was designed around, and from the one the human's 244-minute run was
        // actually holding.
        //
        // So: ONE roster for all three. Posture stays per character (kiteMul,
        // anchorBias, panicMul, ultKind and the kite/flee counts are separately
        // justified and unchanged) — what converges is the BUILD.
        //
        // WATER is added for two reasons that compound: it is the regen
        // ingredient (regenBonus, measured at 2.22 HP/s live — worth 81 levels
        // of pat's character scaling), and it is half of WATER + SUGAR ->
        // SIMPLE SYRUP. applyCraft keeps materials at full level with their
        // stats still applying and only frees the slot count, so WATER ends up
        // costing nothing at all.
        //
        // Super-line count is unchanged: WATER's cocktail is WHISKEY HIGHBALL
        // and SUGAR's is MOJITO, neither of which is on the roster, so neither
        // opens a sixth line toward the Rainbow Gun gate.
        charRoadmap: {
            pat: {
                cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'MOJITO', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'],
                ingredients: ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CRANBERRY', 'SUGAR', 'WATER', 'COFFEE BEANS']
            },
            joe: {
                cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'MOJITO', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'],
                ingredients: ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CRANBERRY', 'SUGAR', 'WATER', 'COFFEE BEANS']
            },
            minguk: {
                cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'MOJITO', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'],
                ingredients: ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CRANBERRY', 'SUGAR', 'WATER', 'COFFEE BEANS']
            }
        },

        // ROSTER EXPERIMENT — CONCLUDED. The prescribed build won the bandit
        // decisively (mean 1.008 vs 0.71-0.87 for every challenger across
        // ~150 credited runs), so every run now plays the user's six. Set
        // back to true to audition alternatives again.
        rosterExperiment: false,
        // USER: purposely do NOT take the Rainbow Gun — the minguk stall
        // build rides maxed supers + time stops instead. (Set to null to
        // hand the choice back to the learned take/skip bandit.)
        rainbowPolicyOverride: 'skip',
        // v6.86.9: a hard ban, above the learned policy and the timing window.
        banRainbowGun: true,
        // v6.87.2 (user): "cap the supercocktails to 5 cocktails". The Rainbow
        // Gun's gate is SIX maxed supers, so five is the number that closes it
        // by construction. Both charRoadmap rosters are built to exactly five
        // completable lines (asserted by the `roster-cap` test); this is the
        // RUNTIME half of the same rule, for the pools that offer things the
        // roster never planned for. A card that would open or finish a sixth
        // line is refused outright, whatever the pool looks like.
        // v6.92.1 (user, naming the risk themselves): "There is a danger to
        // reaching 6 supercocktails since tonic upgrades both gin and vodka
        // tonic super upgrades but the slow from mob rush attacks could be
        // worth having gin tonic."
        //
        // Exactly right, and the cap is the lever. The plan now completes
        // FOUR lines (SOUTH SIDE/MINT, VODKA TONIC + GIN TONIC/TONIC,
        // MOJITO/SUGAR) off THREE keys. Every gun guard is gated on
        // `nSupers >= CAP`, so a cap of 5 leaves them silent until a rogue
        // fifth line already exists — one whole line of slack that the plan
        // does not want and cannot use. At 4 the guards arm the moment the
        // intended plan is finished, and every further line is refused.
        maxSuperLines: 4,
        // v6.110.0: how far an off-plan cocktail with a latent super key may
        // be levelled while the super count is still well below the cap. The
        // user's joe recording took VODKA CRANBERRY to exactly lv4 and ended
        // at 4 supers — below evolution range, so the line never armed.
        gunSafeOffPlanLv: 4,
        // v6.87.4: how far an OFF-PLAN super line must already be before the
        // bot starts paying to avoid it. Below this, an off-plan cocktail is
        // just damage and is judged on merit; above it, the line is close
        // enough to completing that every level is a step toward the gun.
        // 6.87.2 set this to 0 in effect — taxing every off-plan card from its
        // first level — and the first runs showed supers/run collapsing.
        gunPathFloor: 0.5,

        // HELL UNBAN (v6.83.0): ingredients that leave the avoid list and
        // join the plan the moment a run is in hell. GINGER BEER = MOSCOW
        // MULE's super key (knockback whip) = the fifth super line.
        // v6.88.5 (user): "mule out unless it's the only option that doesn't
        // make a 6th cocktail". GINGER BEER was unbanned in hell for exactly
        // one reason — it is MOSCOW MULE's super key — and the mule is no
        // longer a plan cocktail. Leaving it unbanned is the ONLY way the mule
        // could ever complete a sixth super and open the Rainbow Gun gate, so
        // keeping it banned is what makes the mule permanently safe to take as
        // a last resort. Empty list, not a removed field: the unban machinery
        // stays wired for whatever needs it next.
        hellUnbanIngredients: [],

        // SCORING PROFILE (v6.80.0) — which level-up rulebook to play:
        //   'crown-6.74'  the rules of the release that WON the hell crown
        //                 (SUPER NEGRONI pursued as hell-prep, CAMPARI valued
        //                 as its key, MINT +20 when SOUTH SIDE is maxed)
        //   '6.79'        the post-crown rules (SUPER NEGRONI refused as a
        //                 source-verified no-op, CAMPARI decays in hell,
        //                 slot-theft / craft-finish / plan-super bonuses)
        // The profile is part of the version tag, so each gets its own row
        // in pineBot.compare() — switch, play a batch, read the table.
        // Movement, abilities, and the reward function are identical in both.
        scoringProfile: 'crown-6.74',

        field: { w: 540, h: 540, margin: 26 },

        movement: {
            samples: 32,          // candidate directions evaluated per tick
            lookaheadMs: 330,     // how far ahead a candidate step is simulated
            playerSpeed: 2.4,     // fallback px/frame if the real value can't be read
            smoothing: 0.5,      // 0 = instant turns, 1 = never turns
            standoff: 150,         // preferred distance from the enemy mass
            standoffPull: 1.3,   // how hard we hold that distance (kills = sales)
            lootPull: 1.0,        // global multiplier on pickup attraction
            lootRange: 240,       // pickups further than this are ignored
            killOrderDist: 0.5,    // hp-per-px transit charge in the passout kill order (6.85.17)
            stopBossPull: 44,      // frozen-boss station weight (6.85.6/11)
            grindKiteMul: 1.25,    // bossless deep-hell kite pressure (6.85.20)
            kitePull: 2.0,        // tangential sweep around the swarm (conga-line kiting)
            kiteDampFull: 0.25,   // v6.89.4: kite pull at a COMPLETE build in hell (1 = off)
            kiteDampPaused: 0,    // v6.89.6: and under a TIME STOP, on top of that — a frozen
                                  //          field has nothing to sweep around, so the sweep is
                                  //          pure wasted travel that walks the bot off its own
                                  //          burn and out of its corner seat. Was 0.15; zero is
                                  //          the honest value (1 = off). The DEADBAND below is
                                  //          what still steps away from a body that is touching
                                  //          us, so this costs no contact safety.
            // v6.89.6 KITE DEADBAND. Past the point where the pack matches our
            // speed, distance stops being worth anything except the one thing
            // the user asked for: "just enough distance for no contact damage
            // deaths." So against an un-outrunnable pack the kite is no longer
            // a posture with a weight — it is a spacing controller with a
            // threshold. It fires only while something is inside
            // (player radius + kiteBand) and is silent otherwise.
            kiteBand: 20,         // px of margin past contact reach before the spacing kite arms.
                                  //   ~2-3 frames of closing at hell mob speed. Raise it if
                                  //   contact deaths persist; lower it if the corner keeps
                                  //   getting broken by single stragglers.
            kiteSpacingMul: 0.6,  // the spacing kite's weight. It BYPASSES the anchor/corner/damp
                                  //   stack on purpose: those exist to stop the bot touring the
                                  //   arena, and 0.12x would crush a sidestep that is only ever
                                  //   armed when a body is already on us. Not 1.0, because the
                                  //   corner still has to win the tie.
            // v6.89.10: an invulnerability window may only switch off panic and
            // flight while at least this many seconds of it remain. Below the
            // threshold the bot is still untouchable (caution stays relaxed) but
            // must keep the mechanisms that get it out of a crowd, so the window
            // does not end with the bot stranded in the middle of one.
            ultInvulnCommitS: 1.2,
            // v6.111.0: farm pull multiplier while a committed ult window is
            // open. The window is the one interval in which approaching is
            // free; see the dayFarm comment in 05-movement.
            ultWindowFarmMul: 1.5,
            escapePull: 4.0,      // drive through the widest gap when surrounded
            hellCautionMul: 1.3,  // everything hits harder in hell — extra movement caution there
            // v6.86.1 PASSOUT HUG. Source: fireBase() targets nearestEnemy()
            // across ALL enemies, and passouts deal NO contact damage
            // (`e.type!=='passout' && !isInvuln() && ...`). Standing off at a
            // 105-245px ring therefore meant every wandering mob was nearer
            // than the passout and the base attack never once pointed at it —
            // the reason Pat, whose 59-frame single shots have no pierce to
            // leak through, could not kill passouts at all. A free passout is
            // now HUGGED: just outside its body, where it is the nearest
            // enemy and splash/flame cover it, at zero damage cost.
            // v6.86.2 ARMOUR CONFIDENCE (user: "pat is tanky so it can absorb
            // most damages with levelled up olives and negroni"). Levels in
            // the two mitigation lines buy the right to stand in the fray —
            // which is exactly what the passout station and the ult window
            // need. Already applied to the crowd tolerance; now it also buys
            // down caution and the panic threshold, and a tank buys more.
            // v6.86.4: the demo REFUTES armour-as-licence-to-brawl. With OLIVE
            // at 6 and NEGRONI at 5 the human still held crowd p75 = 1 body
            // within 90px, median HP 100% and p10 84% — armour was spent on
            // not dying to the odd hit, not on standing in the fray. The
            // discount survives only as the holdout-anchor licence.
            armorConfPer: 0.025,   // per combined OLIVE+NEGRONI level
            armorConfMax: 0.30,    // cap (anchor licence only — see cautionShare)
            armorCautionShare: 0,
            // v6.86.4 BANK-AND-DETONATE, measured off a 19.7-minute manual Pat
            // demo (2635 samples). The human fired 14 ultimates on cooldown
            // (mean gap 75s), 13 of which reduced the passout count, removing
            // 41 bodies — including 15 in ONE blast from a field of 21. Every
            // shot was taken 55-109px from the nearest body (median 78), never
            // hugging. Base attacks are irrelevant to this: the bodies were
            // 13k HP at 4:34, 193k at 10:08 and 1.8M at 18:54, versus Pat's
            // ~439 dps. So passouts are not farmed one at a time — they are
            // BANKED, and the ult is dropped into the pile when it comes up.
            ultHarvestLeadS: 15,   // start positioning this long before the ult is ready
            ultHarvestPull: 60,    // pull toward the cluster centroid while harvesting
            // v6.93.1 HARVEST APPROACH — the pull above measurably cannot
            // deliver pat/joe to the pile: it competes in the same gain field
            // as the per-enemy repulsion, and the crowd that makes a passout
            // unshootable (fireBase targets nearest) is the same crowd that
            // outbids the pull. OVERRIDES BEAT PULLS (6.89.11, z=-0.06), so
            // when the melee ult is ready and the window is early, the walk
            // to the pile is an override like hunt/park, not a bid.
            harvestApproach: true,
            harvestRangePx: 300,   // approach piles this close; farther is not worth the walk
            harvestStopPx: 72,     // stand this close before casting (demo: humans detonate 44-109px)
            harvestS: 12,          // time-box one approach
            harvestRestS: 20,      // rest before the next attempt
            harvestUntilS: 2700,   // the window: day + hell entry + early hell (user's stated gap)
            harvestMarkSoakHp: 0.65,   // v6.93.3: above this HP ratio a boss mark (40% maxHp) is an affordable toll on the way to the pile
            // v6.94.0 FARM READINESS — the 6.93.2+joe row (n=6, median 167s,
            // deaths at 72s/101s with no cocktail picked) says a 100-HP joe
            // beelining to piles from the opening seconds is a corpse, not a
            // farmer. No approach override until the run has legs.
            farmFromS: 45,     // v6.94.1: the true gate is OWNING A WEAPON (see farmReady); this floor just skips the spawn seconds
                               // v6.99.1 (user: "kill the passouts as soon as they arrive"): 90 -> 45 — the demo owns
                               // VODKA TONIC at gt 26 and MOJITO at 45; the weapon gate does the real guarding
            trekPoFirstS: 600, // v6.94.1 (user): first-landed passouts outrank boss treks this early — their HP is priced at landing time
            // v6.99.1 FUND RUSH (user: "it's not hyper-aggressive with using
            // ultimates to clear passouts to fund the weapon upgrades"). With
            // the ult READY in day the cast on arrival covers marks and shots
            // both — the manual demo walks the crossfire at 3.0 speed and
            // detonates from ~91px. So under fundRush the harvest approach
            // ignores the wide 130px shot halo and the mark-soak arithmetic;
            // only a shot in true collision range still blocks the walk.
            fundRush: true,    // kill switch for the whole doctrine
            fundProjPx: 45,    // collision halo (added to shot r) that still vetoes under fundRush
            fundRushHp: 0.65,  // the rush is for a healthy bot (demo hp median 100); hurt bots keep every old caution
            // v6.99.1 LITTER HUNT (user: "it needs to kill the feed filler
            // boss fast so it doesn't crowd the canvas with marks"). Landed
            // filler litter persists as marks that gate the anchor, corner
            // and harvest across the floor. At litterHuntN litter marks a
            // live roaming boss outranks even the early passout FIFO in the
            // trek order — kill the source, then farm what it was fencing.
            litterHuntN: 4,
            // v6.99.1 (user: "need to get tips faster and not let it stick
            // around wasting time for upgrades"): in day the trek/harvest
            // rest clocks shrink to 40% — the rest exists to break deadlock
            // oscillation, not to idle while tips sit on the field.
            dayRestMul: 0.4,
            // v6.99.2 THE MINUTE-ONE REGRESSION (6.99.1 row, n=241): lowering
            // farmFromS to 45 also lowered the TREK floor, and with the ult
            // ready from the opening the fund-rush waiver sent a one-weapon
            // joe ACROSS THE FIELD at gt 45-70 — ~30 deaths in a tight
            // 64-82 s contact cluster, the exact window 6.97.0 had closed.
            // The 45 s floor belongs to the LOCAL pile walk; the trek gets
            // its old floor back. (The demo's first ult was at gt 155 — the
            // human never crossed the field in minute one.)
            trekFromS: 150,
            // v6.99.2 ENTRY PREP (funnel n=240: 35 entrants, 31 dead within
            // 300 s of the latch, median entry def 29.2 vs the parkAudit bar
            // of 35): from entryPrepFromS the fund rush stands down — the
            // armor gate and mark caution return, and 03's entry-armor
            // checkpoint routes late-day picks back into OLIVE so the run
            // arrives at the entrance wearing the seat build.
            // v6.100.0: 900 -> 1050. The 6.99.2 row (n=131, pre-speed, clean)
            // measured the 900 cutoff collapsing dayClear 0.15 -> 0.02 — the
            // pre-registered failure mode ("push it later, don't revert").
            // 1050 leaves the last 2.5 minutes for arriving armored; the
            // funding rush keeps the 17.5 minutes that produced the 0.15.
            entryPrepFromS: 1050,
            // v6.105.0 THE ENTRANT IS ONE OLIVE LEVEL SHORT — measured four
            // times over. medianEntryDef reads 29.2 on 6.100.0, 6.101.0 AND
            // 6.102.0 (n=110). 29.16 is EXACTLY OLIVE 5; the ceiling is
            // OLIVE 6 = 34.992, and parkAudit's seat-reaching group entered
            // AT that ceiling while the never-parked group sat at 29.2. The
            // whole difference between a run that seats and one that dies in
            // the entry surge is a single armour level.
            // The 6.99.2 checkpoint was not wrong, it was too LATE: it opens
            // at entryPrepFromS (1050) and hell latches at 1200, so it gets
            // ~150 s — often not even one level-up — to buy that level. This
            // is a PICK WEIGHT, not a movement gate, so opening it earlier
            // costs no farming tempo; that distinction is exactly what the
            // 6.99.2 entryPrepFromS collapse (dayClear 0.15 -> 0.02) taught.
            entryArmorFromS: 750,
            // ── v6.123.0 THE REGEN LEG OF THE PARK GATE ────────────────────
            //
            // `parkArmor` needs defense >= 30 AND regen >= 1.0. 6.99.2/6.105.0
            // gave the armour leg a CHECKPOINT and it worked: parkMiss.armor
            // is now 1.6-2.2%. The regen leg never got one, and at 6.122.0
            // n=79 `parkMiss.regen` is 45.3% of all seat-miss ticks (472,405
            // of 1,043,391) — the largest bucket by a wide margin.
            //
            // parkAudit splits the two groups on regen and ONLY on regen:
            //     SEATED       medianEntryDef 35   medianEntryRegen 2.0
            //     NEVER PARKED medianEntryDef 35   medianEntryRegen 0
            // Identical armour. Runs that enter under 1.0 spend ZERO seconds
            // parked no matter how long they live (t=6257 def 35 regen 0
            // parkT 0 {regen:151657}; t=4811 def 35 regen 0 parkT 0
            // {regen:108435}). It is a threshold, not a gradient.
            //
            // Every observed entry regen is 0.284*k — a WATER ladder that
            // habitually stops at level 2 (0.568). The bar needs level 4
            // (1.136). So the miss is two level-ups, not a missing card.
            //
            // Why the existing day bid cannot close it: it is scaled by the
            // CEM dim `strategy.regenDeficit`, whose mean collapsed
            // 17.82 -> 20.05 -> 11.36 across gens 737/740/741 in a box floored
            // at 0. Two pick logs, same state: `entry-regen-water(100%short)`
            // paid +59 at n=61 and +24 at n=70. The search is walking it to
            // zero, and it is right to on its own evidence — regen costs day
            // tempo NOW and pays at the seat twenty minutes later, which is a
            // credit-assignment horizon CEM does not have.
            //
            // So this is a GATE, not a weight, and deliberately NOT a TUNABLE
            // dimension — the same shape and the same reason as entry-armor.
            // It releases the moment regen clears the bar.
            // v6.124.0 CORRECTION: the 6.123.0 comment here claimed the cost
            // was "bounded at the two-to-four WATER levels that clear it".
            // WRONG. The n=82 entry row read regen 2.22 = WATER 6 + SIMPLE
            // SYRUP 1 — SEVEN regen levels. The checkpoint only breaks the
            // ice; once WATER is owned, day-order8+123, craft-half+34 and
            // craft-pair finish the ladder on their own. The bill was
            // supersPerRun 1.2 -> 0.9/1.0 and dayClearRate 0.53 -> 0.45.
            entryRegenFromS: 750,
            // v6.95.0 DAY FARM STANCE — the 6.94.1 digest's smoking gun:
            // crowdMedian 0, crowdP75 1 across a 20-minute day. The bot was
            // SAFE AND BROKE: kills are the only source of XP/gold/levels,
            // and a fortress pat (OLIVE capped at gt 547, armor 35 against
            // flat 22.4 contact, income capped by the 33-frame invuln) spent
            // the day standing where mobs aren't. First super 785, two lines
            // at hell entry, dead in 6s. Once armor is MEASURED at cap and
            // HP is healthy, the common-mob repulsion is discounted and the
            // standoff collapses so fireBase always has a target. Marks,
            // projectiles, lines, walls, and boss hitboxes keep FULL weight
            // — only the hazard class armor already pays for is discounted.
            // Gated on liveDefense() (the park lesson: read the stat, not
            // the ingredient), and OFF from farmUntilS to re-harden for the
            // hell-entry surge.
            farmStance: true,
            farmDefense: 30,      // measured armor floor to enter the stance
            farmHp: 0.7,          // HP ratio floor
            farmUntilS: 1100,     // re-harden before the entry surge
            farmContactMul: 0.45, // common-mob fear multiplier in the stance
            farmStandoffMul: 0.25,// ring at contact range: the ring-keeper must never out-pay the grind (0.55 left an 82px ring that still backed out of a 70px crowd)
            farmBossFearMul: 0.7, // boss standoff-gradient ease (hitbox bands stay full)
            harvestCrowdBias: 36, // hold the pile on the CROWD side: mobs in front, splash/pierce leak into the pile
            // v6.97.0 THE MINUTE-ONE SPRINT IS GATED ON BULK. The sprint
            // (dayFarm x1.7 before gt 60, "kill mobs and passouts flat-out so
            // the first attack upgrade lands before the first wall") was
            // written for 180-HP pat. The 6.96.2 phase rows show what it does
            // to 100-HP joe: 13 of 28 day deaths land at 59-85 s, zero
            // supers — he charges the first wave weaponless, gets enveloped,
            // and dies as the sprint window closes. A character under
            // sprintMinHp base HP takes fragileSprintMul instead of 1.7 in
            // minute one (the day-wide 1.35 funding amp from 60 s onward is
            // untouched). Dead joe funds nothing.
            sprintMinHp: 120,
            fragileSprintMul: 1.0,
            // v6.94.0 DAY TREK — the FIELD TREK below (v6.85.10) was a PULL,
            // the third instance of the 6.89.11 lesson (overrides beat
            // pulls). Now an override, with the target set widened to the
            // user's day campaign: "clear day with killing all the bosses -
            // no booking mobs, passouts, and mobile bosses". Priority:
            // roaming boss FIRST (tips carry roster upgrades - the highest-
            // leverage loot), then oldest far passout (FIFO despawn), then
            // wall cluster. Transport only: it walks until the target is
            // local (trekReleasePx) and hands over to the normal combat
            // machinery. Day only, healthy only, time-boxed like the hunt.
            trekOverride: true,
            trekS: 12, trekRestS: 20, trekReleasePx: 190,
            // v6.94.0 JOE PIERCE ALIGNMENT — stand so the base-attack ray
            // (through the NEAREST enemy) continues into passouts/walls
            // behind it. Every ordinary volley then mines the pile.
            pierceAlignValue: 16,
            // v6.94.0 flame stance: stand this far outside the near END of
            // the best pierce line, facing down it — standing at the pile
            // CENTROID wastes the half of the burn behind the bot.
            flameStandOff: 55,
            // fireCrossBonus (user, 2026-08-28): the +duration upgrades
            // appear LATE IN HELL when items are nearly maxed — not a day
            // tool. Do not build day doctrine around burn duration.
            // v6.86.7: the flame cross is a DIRECTIONAL flamethrower (3 shots
            // every 3 frames along the aim vector, speed 9-11, rainbow-gun
            // class, 5s + fireCrossBonus). Pointing it is the whole skill, so
            // during a burn the planner is paid for headings that line the
            // best target up with the stream.
            flameAimValue: 95,   // measured: below ~90 the aim term loses to ordinary station/loot pull
            flameAimRange: 420,
            // v6.86.2 FEASIBILITY GATE. A drunk-wave passout carries
            // DIFF().hp * 8*(1+(estBoss-1)*0.7)*(1+gt/60*0.22) * 2 HP:
            // ~1.4k at 5 min, 7k at 10, 27k at 15, 77k at 20, 500k at 30.
            // Pat's whole base output is ~440 dps with every projectile
            // landing, so past ~12 minutes a passout costs minutes of
            // dedicated fire and the bot was orbiting bodies it could not
            // kill. Measure the damage actually going in and walk away when
            // the projected kill time is not worth it — they deal no contact
            // damage, so an abandoned one is just scenery.
            poTtkBudgetS: 30,      // day: a passout worth standing on
            poTtkBudgetHellS: 18,  // hell: time is worth more
            poProbeS: 6,           // in-range seconds before judging
            // v6.118.0: hard cap on the ult-ready waiver. Past this many
            // in-range game-seconds the measured dps stands regardless of the
            // ult cooldown — at ult 6 the ult is ALWAYS "up soon", which made
            // the give-up gate unreachable for a whole 76-minute run.
            poProbeHardS: 30,
            poEngageRange: 150,    // "in range" for the probe clock
            passoutValue: 34,     // passed-out customers = gold + XP (user: weigh the loot HEAVILY)
            wallSiegeValue: 26,   // NO BOOKING walls = big gold/XP piles (user: weigh the loot HEAVILY)
            bossEngageValue: 24,  // boss kills = big loot (user: weigh the loot HEAVILY)
            // v6.107.0 RING MULTIPLIERS — the CEM could tune how much the bot
            // WANTS to engage (the *Value weights above) but never WHERE IT
            // STANDS. Both rings were hand-fitted constants; these scale them
            // so the search can test the fit. Narrow boxes: this distance is
            // the difference between landing the burn and eating a one-hit.
            bossRingMul: 1.0,
            poRingMul: 1.0,
            // v6.107.0 ARMOUR TIER (user's phasing: damage first 5 minutes,
            // armour 5-10). Before this game-time the pure-defence
            // ingredients give up part of their day-order rank; after it they
            // get all of it back. A bounded subtraction, never a veto — a
            // pool offering nothing else must still be takeable.
            armorTierFromS: 300,
            armorTierHold: 60,
            // v6.107.0 THE DROP ANCHOR (user: "if you kill a rushing mob with
            // powerful weapons, you can pick up lucky items like time pause,
            // flame cross, or tequila shots"). Pull toward a pack the bot can
            // actually clear, so the drops get a chance to exist. Full
            // reasoning at the arming block in 05-movement.
            anchorValue: 14,      // searchable from 0: the CEM may switch it off
            anchorTtkS: 5,        // seconds-to-clear that still counts as "killable"
            anchorRange: 190,     // pack radius considered
            anchorMinPack: 3,     // fewer bodies than this is not a pack
            anchorMinHp: 0.55,    // never anchor while hurt — fixed, not searchable
            wallWeight: 2.2,
            panicHp: 0.55,        // below this HP ratio, survival dominates
            panicLootDiscount: 0.35,
            crowdedCount: 5,      // this many threats inside nearbyRadius = crowded
            nearbyRadius: 90
        },

        threat: {
            enemyWeight: 1.5,     // global multiplier on enemy repulsion
            enemyRange: 200,      // enemies beyond this are ignored for planning
            contactPad: 16,       // treat this many px outside the hitbox as contact
            projWeight: 4.5,      // enemy projectiles
            projLookaheadMs: 650,
            projPad: 14,
            noKillBonus: 1.7,     // undestroyable projectiles are worse
            markWeight: 8.0,      // telegraphed AoE (dropMarks)
            markPad: 10,
            // v6.97.0 SHIELDLESS MARK FEAR (fragile profile). The 6.96.2
            // phase rows put 10 of 28 joe day deaths on marks, four of them
            // inside one 17-second band at ~550 s — a timetabled mark rain
            // that a shieldless 100-HP character cannot soak. The fragile
            // profile already refuses mark SOAKS without a real NEGRONI
            // shield (markShield, 6.95.1); this is the same doctrine applied
            // to the danger field: while player.shield is below the
            // profile's markShield floor, every mark weighs this much more.
            // Read from the LIVE stat, never an ingredient name. Characters
            // without a markShield floor (pat, minguk) are untouched.
            fragileMarkFearMul: 1.6,
            // v6.111.0 SPLIT (see the TUNABLE comment for the full argument).
            // lineWeight now prices the TELEGRAPH only; the live charge has
            // its own weight and its own box. Defaults keep the combined
            // behaviour roughly where it was for an unarmed lane while giving
            // the armed lane a floor the telegraph cannot drag down with it.
            lineWeight: 3.0,          // unarmed telegraph lanes
            lineArmedWeight: 8.0,     // live charges
            linePad: 14,
            // v6.120.0: the game's OWN hit test for a charge lane, source-
            // verified twice (the 547-run line-death audit that corrected 18 ->
            // 63, and lineCost's comment). This is the radius that kills, with
            // no padding — the telegraph escape needs the real number, because
            // the padded/graded cost put its threshold at perp 40.8 and left
            // the bot standing in the 40.8-63 band for the whole telegraph.
            lineKillPerp: 63,
            // v6.111.0 LANE ESCAPE. `laneUrgent` has fired the dash on an
            // armed lane since 6.8x, but the dash takes its DIRECTION from
            // plan.dx/dy — the argmax of the danger field, in which the lane
            // is worth exactly `lineWeight`. With that scalar at its box
            // minimum the field barely registers the lane, so the escape
            // hatch was pointing wherever everything else pointed, and a
            // dash along a 126 px-wide lane is a dash further into it.
            // The exit from a lane is geometric, not preferential: step
            // PERPENDICULAR to the ray. `laneEscape` makes that a movement
            // override, like park and hunt, rather than one more term
            // competing inside the sum it is supposed to overrule.
            laneEscapeArmS: 1.6       // seconds of telegraph left that still counts as "go now"
        },

        // DEEP-HELL POSTURE (v6.82.0). `depth` ramps 0 -> 1 between startS
        // and fullS; every multiplier below scales with it. At 246 min the
        // ramp is ~0.65: boss contact band x1.4, prediction horizon 12 -> 20
        // frames, dash gate 650 -> ~480 ms.
        deepHell: {
            startS: 7200,          // 2 h: where the top-5 runs start dying
            fullS: 21600,          // 6 h: full hardening
            bossPadMul: 1.6,       // boss/rival contact band width at depth
            reachMul: 1.3,         // boss fear radius at depth
            horizonFrames: 20,     // contact-imminent lookahead at depth (base 12)
            dashGateMs: 420,       // dash rate limit at depth (base 650 in hell)
            ultOnContact: true,    // contact imminent + ult ready = fire (invincibility eats the hit)
            markPadMul: 1.5,       // v6.84.0: telegraphed-blast avoidance radius at depth
            markWeightMul: 1.4,    // v6.84.0: and how hard those blasts are weighted
            // v6.88.2 ULT RETRY (corrected). Manual demo #5 logged 2174
            // `useUltimate` calls in 3945 s and I read that as a cast every
            // 1.81 s — i.e. continuous invulnerability. It is not. Read live
            // from the page: ULT_CD is 80 s ("필살기: 80초 쿨타임"), scaled by
            // player.ultCdMul (0.6667 observed) = a real 53.3 s cooldown, and
            // ultReadyAt - ultSpiralUntil measured 50.5 s. The recorder wraps
            // useUltimate and logs REJECTED calls too, so 2174 is button
            // presses; roughly 74 casts actually landed. Invuln uptime is
            // ~5.3%, not 100%, and it is NOT what keeps the human alive.
            //
            // What remains true: the retry gate should not add latency on top
            // of a 53 s cooldown. At 2500 ms the bot casts on average 1.25 s
            // late every cycle; at 300 ms, 0.15 s. That is a ~2% gain in casts,
            // not a strategy. Kept because it is free and correct, not because
            // it is the lever.
            //
            // THE ACTUAL LEVER is ultCdMul. It is the only term that changes
            // how often the window is available at all, and it is already at
            // 0.6667 in a live deep run — find what drives it (TOMATO JUICE is
            // tagged 'ult' and is the prime suspect) before tuning anything
            // else about the ultimate.
            ultChainFromS: 9000,   // 150 min (user): the deep-deep posture threshold
            // v6.89.2 (user): "especially in deep hell mode, before reaching
            // anchoring stage — may need to bring anchoring forward so mobs can
            // only attack from certain sides."
            //
            // THE CORNER GATE WAS A GATE THAT NEVER OPENED. cornerAnchorFromS
            // was 9000 (150 min). The measured minguk runs on this roster end
            // at 1438 / 2726 / 2841 / 4073 / 6124 / 7261 s — the longest is 121
            // minutes, half an hour short of the threshold. So the clock path
            // has NEVER fired in a recorded run; only `ringHuge` could, and it
            // needs a boss ring at 55% of the canvas. The whole corner doctrine
            // has effectively been dead code in the regime it was written for.
            //
            // The doctrine already names its own start: "deep hell once bosses
            // don't drop tips AND the boss damage ring becomes as large as the
            // canvas". Tips stop at tipWindowToS = 4800. Pulling the clock back
            // to that line puts the corner in the band where runs actually die
            // and makes the two halves of the phase model agree, instead of
            // leaving 70 minutes where the doctrine says deep hell but the
            // planner still says mid-game.
            //
            // NOT pulled earlier than 4800 on purpose: 1800-4800 is the TIP
            // WINDOW, where the doctrine parks on frozen bosses to farm the
            // drops that fund the build. Cornering through that phase would
            // fight the revenue phase for the sake of a posture, and the runs
            // that reach 100+ minutes are the ones that farmed it.
            //
            // The geometry is the point, as the user put it: in a corner the
            // approach arc collapses from 360 degrees to about 90, so the crowd
            // can only arrive from certain sides — the same reason the corner
            // is immune to unaimed boss marks.
            ultChainGateMs: 300,   // retry cadence once deep (was 2500)
            // CORNER ANCHOR (user, deliberate strategy in demo #5). Boss
            // drop-marks spawn UNIFORMLY at random inside [52, W-52] x
            // [62, H-62] and are never aimed; damage is player.maxHp*0.40
            // ('again', r58, 0.6 s telegraph) and *0.35 ('selfie', r52). Being
            // a % of max HP, no amount of HP or armour defends against them —
            // only position does. At the true arena corner the nearest possible
            // mark CENTRE is 80.9 px away against a ~70 px reach: geometrically
            // immune, versus ~8.5% per mark in open field. Marks are 21-31% of
            // all deaths.
            // v6.88.4 (user): the tip window — bosses still drop tips, so
            // super evolution is still reachable and a frozen boss is a free
            // kill at point-blank range.
            tipWindowFromS: 1800,      // 30 min
            // v6.112.0: the ring test's threshold, named so it is tunable and
            // so `ringHuge` stops being a magic 0.55 buried in the planner.
            // Measured against the RAW enemy array — see the comment at the
            // ringHuge definition for why the filtered list made it dead.
            ringShare: 0.55,
            // v6.116.0 THE FIXED CADENCE CANNOT WIN. A least-squares slope
            // needs >= 3 samples, so a fixed interval T needs the boss to live
            // 2T; a fixed horizon of 48T needs the RUN to last that long. Both
            // shipped versions failed one of the two:
            //   30 s  -> 3 samples in 60 s, but only 360 s of horizon, so the
            //            fit was taken entirely before the growth showed. Every
            //            kind reported growthPer100s = 0.
            //   120 s -> 5760 s of horizon, but 240 s to a third sample against
            //            a MEDIAN RUN OF 854 s. Every kind reported null.
            // So the cadence now GROWS. Sample every `bossCensusEveryS`; when a
            // boss fills its 48 slots, throw away every second sample and
            // double its own interval. Coverage is 720 s at 15 s spacing, then
            // 1440 at 30, 2880 at 60, 5760 at 120 — three samples inside the
            // first minute AND an unbounded horizon, in 48 slots.
            bossCensusEveryS: 15,
            bossCensusSamples: 48,
            // v6.114.0: when the day's regen checkpoint opens. Was effectively
            // 600 s — one full income bucket AFTER the pool starts draining.
            // 120 lets the opening weapon land first and then starts fixing the
            // arithmetic while there is still a pool to protect.
            regenFromS: 120,
            tipWindowToS: 4800,        // 80 min
            cornerAnchorFromS: 4800,   // v6.89.2: was 9000 (150 min) — a gate no
                                       // recorded run ever reached. Now the tip
                                       // window's close, which is where the
                                       // doctrine itself starts deep hell.
                                       // Still fires sooner if a boss ring
                                       // fills the canvas.
            // v6.89.3 (user): "still trying to find the right time on when to
            // kite and then switch to corner anchoring — seems like it can be
            // much earlier than the previous 150 minute mark estimate."
            // Since the right moment is still an open question, it is a LIVE
            // SWITCH rather than a rebuild:
            //   pineBot.config.deepHell.cornerWithZoner = false   // clock only
            //   pineBot.config.deepHell.cornerAnchorFromS = 3000  // move the clock
            // true = corner as soon as hell is latched and SOUTH SIDE is owned,
            // which is the earliest the burn-in-the-funnel plan can work at all.
            cornerWithZoner: true,
            // v6.89.8: past this depth, PANIC and FLIGHT stop vetoing the corner
            // anchor and become reasons to hold it. `flight` is true for
            // essentially all of deep hell (unkillable bodies, near >= 4, no
            // pause), so `!flight` in the corner gate was switching the corner
            // off exactly when it was needed — the corner has effectively never
            // engaged at depth outside a time stop. Shallow hell keeps the old
            // vetoes, where fleeing still opens a gap.
            // v6.90.0 DEEP PARK. Measured directly, not modelled: with the bot
            // STOPPED and the player parked in a corner at 258 enemies, HP went
            // 309/309 -> 306/309 across 155 seconds. Three points. The mitigation
            // model predicted ~2400 over that window and was wrong by three
            // orders of magnitude, because it assumed contact runs at the
            // 38-frame invuln ceiling; in a corner the wall removes most of the
            // approach arc and the auto-attack clears the rest.
            //
            // Against that, the bot's own median run is 22 minutes. A player
            // doing NOTHING outlives it by a factor of five. So past the point
            // where the defensive build makes the corner survivable, the correct
            // movement policy is to walk to the corner and stop.
            //
            // Gated on the BUILD rather than a clock, which sequences itself:
            // farm until armor and regen are in, then park. Nothing is given up
            // by parking at that point — at 125 minutes everything was Lv6 and
            // there was nothing left to buy.
            park: true,             // live kill switch: pineBot.config.deepHell.park = false
            // v6.90.1: was 1800 (30 min), which put park PAST the phase that
            // actually kills runs. incomeAudit over 207 runs:
            //
            //   min 20  lossPerSec 5.96   dtS 46841   <- the worst in the profile
            //   min 70  lossPerSec 0.77
            //   min 160 lossPerSec 9.99   (and gainPerSec 9.41 — balanced)
            //
            // Damage does NOT track the 30x enemy speed curve. The killing zone
            // is HELL ENTRY, and `firstNegativeMin` is 20 — which is also the
            // measured median run length. Park has to cover it or it cannot
            // touch the median at all.
            //
            // 5.96/s divided by the 9.8 per-hit floor is ~0.61 hits/s at entry
            // against ~0.08 at 70 minutes: the bot takes EIGHT TIMES the contact
            // at hell entry, because that is where it is running around in the
            // open with a surge on it instead of seated.
            parkFromS: 1200,        // hell entry. Armor is already at cap by ~12 min.
            parkOliveLv: 4,         // fallback only (see armorLevel): defense = 5.832 x OLIVE
            // ── v6.117.0 THE GATE SAT BETWEEN TWO RUNGS OF A DISCRETE LADDER ──
            //
            // The seat-miss census made this visible in one line: `armor` is 20%
            // of every hell tick the bot is not seated, and `medianEntryDef` is
            // 29.2 against a gate of 30. Armour is not continuous — it comes in
            // ARMOR_PER_LEVEL = 5.832 steps:
            //     5.8  11.7  17.5  23.3  29.2  35.0
            // A gate at 30 therefore means "OLIVE 6, exactly", and it excluded
            // the MEDIAN BUILD by 0.84 points. Third time this session a
            // threshold has been set inside a gap in a discrete ladder
            // (capStable.defMin 35 vs a 34.992 ceiling; contactBreakEven's
            // unreadable-armour default of 0).
            //
            // And the arithmetic says the gate should not have been near 30 at
            // all. Armour is FLAT SUBTRACTION with a floor of 1 against a 22.4
            // contact hit, so every level at or above 21.4 takes exactly 1
            // damage per hit. Rungs 4, 5 and 6 are IDENTICAL on the seat. The
            // gate was demanding two levels that buy nothing.
            //
            // The rows price it. Runs denied the seat for their whole hell
            // phase, booking 100% `armor`, while carrying regen ABOVE the 1.579
            // break-even: def 23.3 / regen 1.71 (1818 ticks), def 23.3 / regen
            // 2.22 (1635), def 23.3 / regen 1.71 (1015), def 23.3 / regen 1.14
            // (6683 and 4118). Builds that could have sat there indefinitely,
            // standing up instead.
            //
            // So the gate is the contact floor: contactDmg - 1. Named as the
            // derivation rather than the number, and `break-even` asserts it
            // stays at or below that point.
            parkDefense: 21.4,
            // v6.95.2 THE ENTRY SEAT (user: "needs more consistency in
            // building up to this setup in day mode and early hell"). The
            // 195-minute recording shows the SEATED state winning; the 6.94.1
            // digest shows death six seconds after entry, mid-field. The ramp
            // now ends where the winning posture begins: farm until
            // farmUntilS (1100), re-harden, then WALK TO THE SEAT before the
            // entry surge spawns, and hold it through early hell until the
            // real park (armor+regen gated) takes over. If the park gates
            // have not passed by entrySeatUntilS, the seat releases and the
            // normal early-hell doctrine resumes — the bridge is a WINDOW,
            // not a promise the corner is safe forever without armor.
            entrySeat: true,
            entryPrepS: 1140,      // day: start walking to the seat here
            entryDayMaxS: 1320,    // day upper bound (hell never latched -> release)
            entrySeatUntilS: 1290, // hell: hand over to park (or release) by here
            // v6.96.0 THE RUN CAP (user): "we need to add a kill itself
            // feature as we have established it can't die once the full set
            // up is complete ... or have some cap of runs ... to stop at the
            // 200 minute mark." The 6.95.0 marathon proved it literally: the
            // parked full build sat at 469/469 HP against 256 enemies and the
            // run only ended because the user overrode the bot by hand. An
            // immortal run books NOTHING until it ends, so past this many
            // game-seconds the bot ends it the only way the game offers — it
            // walks into the crowd and dies. The movement layer dives at the
            // nearest live enemy (top of the override chain: outranks hunt,
            // park, seat, harvest, trek) and the abilities layer holsters the
            // ult, whose invulnerability window is the one thing that could
            // keep a full build alive through the dive. Death then books the
            // run through the normal over() path — stats, CEM reward, top-5
            // row — and the auto-restart begins the next run unattended.
            // Purely gt-based, no hellDetected guard: day ends at ~1320 s so
            // only a hell run can reach it, and a run that somehow got here
            // with detection broken should STILL be capped. 0 disables.
            // v6.99.3 (user): 12000 -> 9000 — "we can adjust the deep hell
            // run ends to 150 minutes." The 200-min cap was set when a cap-out
            // was rare; with the day doctrine funding real entrants the
            // immortal-build hours are better spent as more day/entry samples.
            // ROW-READING: runs at ~9,0xx s on 6.99.3+ are CAPPED
            // (right-censored); the ~12,0xx censoring applies to 6.96.0-6.99.2.
            runCapS: 9000,
            // v6.101.0 THE CAP LADDER (user: "the bot is not dying even with
            // the kill protocol"). Measured proof the 6.96.2 patrol failed:
            // 6.100.0 booked runs at 25,141 s and 22,800 s against runCapS
            // 9000 — the clock cap fired on time and the bot then survived
            // FOUR AND A HALF MORE HOURS. mitigation-model.md says why that
            // is impossible in sustained contact: hurtPlayer sets invuln=38
            // frames, so contact lands 1.58 hits/s x ~9.8 = ~15.5 dps against
            // a measured regen of 1.71-3.07 HP/s. Standing in real contact
            // costs ~13 HP/s net and kills a 469-HP build in ~36 s. So the
            // patrol was never IN contact — it toured the four corner regions,
            // which is exactly where park/seat sits BECAUSE the corner
            // geometry is safe. The cap was walking a circuit of the safest
            // ground on the map. Three stages now, each escalating only if
            // the one before it failed:
            //   1. SMOTHER (0 -> capStandS): stand ON the nearest boss, or on
            //      the crowd centroid, and STOP. No evasion, no dash, no ult.
            //      36 s is the physics; capStandS is 4x that for margin.
            //   2. capStandS -> capForceS: call the game's own hurtPlayer().
            //      A natural death, booked through the normal over() path.
            //   3. past capForceS: hard-book (finishRun) + backToTitle, so an
            //      unattended farm can NEVER be parked on one immortal run
            //      again whatever the game does.
            // v6.103.0 MEASURED: RUNG 1 HAS NEVER KILLED ANYTHING. All six
            // 6.102.0 cap-outs booked at EXACTLY capAt + 150 s — that is
            // capStandS to the second (4727->4877, 5119->5270, 4002->4151,
            // 3600->3750 x2, 6781->6931). The smother stood in the crowd for
            // the full budget every time and rung 2's hurtPlayer did the
            // killing. Budget cut to 45 s: the mitigation model puts a real
            // sustained-contact death at ~36 s, so if the smother is ever
            // going to work it works inside that window, and anything longer
            // is pure wasted farm time plus a fake death cause on the row.
            // v6.105.0: EIGHT of eight cap-outs across two versions and two
            // budgets have now died at exactly the rung-2 boundary — 150 s
            // six times on 6.102.0, then 45 s twice on 6.104.0 (3141->3186,
            // 3963->4007) with the body-aiming smother in place. Rung 1 has
            // never killed anything in any configuration. Likely mechanism:
            // a maxed build kills whatever body it stands on inside a second,
            // so "nearest body" is a target it never actually rests against.
            // Kept as a token window rather than removed — a natural death
            // still books an honest cause when one happens — but it stops
            // costing the farm a minute per cap on a bet that keeps losing.
            capStandS: 15,         // stage 1 budget: stand in contact this long before escalating
            capForceS: 120,        // stage 2 budget: past this, book the run and force a restart
            // v6.108.0 WALL-CLOCK TWINS of the two budgets above. The ladder
            // escalates on max(game stage, wall stage) — see the escape block
            // in 05-movement for the 0.021x measurement that forced this.
            // Sized so the GAME budgets still govern a healthy run (15 < 45
            // and 120 < 180 at speed 1.0) and only a starved page ever
            // reaches these first. Set either to 0 to disable that arm.
            capStandWallS: 45,
            capForceWallS: 180,
            // v6.108.0 SATURATION ARM. Measured on the stalled run: enemies
            // pinned at 260-261, HP 1.00, marks and lines zero, pickups
            // 79 -> 238 uncollected. enemyMin sits below the observed 260 cap
            // so a field that is merely dense does not trip it, and the hold
            // is a full minute of REAL time with both signals continuously
            // true. minGtS keeps it out of the day and the entrance entirely.
            // Full reasoning at the saturation block in 05-movement.
            saturation: { enemyMin: 200, hpFloor: 0.97, holdWallS: 60, minGtS: 1800 },
            // v6.99.3 EARLY CAP — the stability proof. From fromS on, if for
            // holdS consecutive game-seconds hp never dips under hpFloor
            // while measured defense >= defMin and supers >= supersMin, the
            // build is immortal-in-practice and the patrol engages early:
            // the remaining hours teach nothing, and the next run's day and
            // entry are where the learning lives. holdS: 0 disables.
            // v6.100.1 (user: "the bot is not dying even with the kill
            // protocol"): 6.99.3 zeroed capStableSince on ANY instantaneous
            // hp dip below hpFloor, but this is a contact-damage game — a
            // tanky build still gets chipped every few seconds, so a real
            // 300 s streak with zero blips essentially never completes.
            // dipGraceS tolerates a blip shorter than this many game-seconds
            // (the clock keeps running, just doesn't reset); a dip that
            // outlasts the grace still resets fully. 0 = old strict behavior.
            // v6.102.0 THE GATE WAS ONE HAIR ABOVE THE GAME'S CEILING.
            // defMin shipped at 35. `liveDefense()` returns player.defense,
            // and the game computes
            //     player.defense = min(60, 3*upDefense + pas.armor)
            // where pas.armor is 5.832 per OLIVE level, OLIVE caps at 6, and
            // upDefense is NOT OBTAINABLE (the up* counters are not cards the
            // pool offers). So defense caps at 6 x 5.832 = **34.992**, and
            //     34.992 >= 35  ->  false, on every frame of every run.
            // The early cap has therefore been DEAD CODE since 6.99.3, which
            // is the real reason earlyCaps has read 0 in every row — not the
            // dip-grace (6.100.1), not the fromS floor.
            //
            // How the bug was born, because the pattern will recur: parkAudit
            // reports the entrance build with `+dEnt.toFixed(1)`, so 34.992
            // PRINTS AS 35.0. The gate was written from the audit table
            // instead of from the stat. Same family as the ownedLevels trap
            // (findings-and-fixes.md): a rounded proxy read as the quantity.
            // 34.9 sits under the ceiling with room for float noise.
            // v6.103.0 fromS 3600 -> 2400, SET FROM DATA AT LAST. The 6.102.0
            // funnel is the first row where the proof could fire (defMin), and
            // it carries the measurement the 3600 guess never had:
            //   buildsReady 13, medianReadyAt 1854, range 1398-2438.
            // Builds complete in a TIGHT band around gt 1854 — half an hour,
            // not an hour — and the latest one ever seen was 2438. So 3600
            // was ~1750 s of pure waiting after the build was already done,
            // and two of the six cap-outs fired at EXACTLY 3600, i.e. the
            // floor, not the proof, was the binding constraint.
            // 2400 sits just above the observed max readyAt, so it stops
            // gating builds that finished long ago while never capping one
            // that has not banked armour, supers AND holdS of held HP. The
            // hp hold is doing the real filtering: of the 13 ready builds,
            // 7 died naturally between 2523 and 7394 because their hold
            // never completed — being "ready" is necessary, not sufficient.
            // v6.132.0 `supersMin: 3` IS GONE, REPLACED BY `build` (user:
            // "let's remove this from the rule and instead replace it with
            // has southside, simple syrup, olives, and sweet vermouth or
            // black vermouth all maxed out"). The live report that prompted
            // it had hp and defense both passing and `supers: 2` alone
            // holding the gate shut, with streakS 0 and ~1,090 s left — the
            // funnel had already flagged supersMin as the binding constraint
            // on nearly every ready build. Clauses are AND across, OR within;
            // levels are read from `player.weapons` by buildGateState(), NOT
            // from ownedLevels (see the BUILD GATE block for why that
            // distinction has cost this project four versions once already).
            // An empty list disables the leg.
            capStable: { fromS: 2400, hpFloor: 0.97, defMin: 34.9, holdS: 300, dipGraceS: 4,
                build: [['SOUTH SIDE'], ['SIMPLE SYRUP'], ['OLIVE'], ['SWEET VERMOUTH', 'BLACK VERMOUTH']] },
        // v6.91.2: the real gate. Cap is 34.992; measured live at 34.992.
            parkRegenRate: 1.0,     // HP/s from regenBonus. Measured live at 2.218.
            // v6.112.0: the gate is now max(parkRegenRate, breakEven * this).
            // 1.0 means "park only when regen actually out-heals the contact
            // the anchor will take" — see contactBreakEven(). Set to 0 to
            // restore the pre-6.112.0 flat 1.0 gate exactly.
            //
            // v6.116.0 RETRACTED — the gate was right about the physics and
            // wrong about the decision, and three reports of park.reachRate
            // say so: 0.44 -> 0.34 -> 0.31 across exactly the versions this
            // multiplier has been live.
            //
            // The arithmetic it enforces: at the armour cap every contact hit
            // does 1 damage and `player.invuln = 38` rate-limits contact to
            // 60/38 = 1.579 hits/s, so 1.579 HP/s is the steady drain on the
            // seat. True. But `medianEntryRegen` is 1.0, so the bar vetoed the
            // seat in the MEDIAN run — and the same report prices what the
            // veto costs: SEATED medianTimeS 3205 against NEVER 1304. The gate
            // was trading a measured 2.5x survival multiplier for a model of
            // INFINITE survival the median build never reaches.
            //
            // A seat at regen 1.0 loses 0.58 HP/s. That is not a dying build,
            // it is a build with ~170 s of margin per 100 HP, before the ult's
            // 10-15% invuln share and the zoner's body-clearing are counted.
            // Not sitting down loses faster. Back to the flat 1.0 floor; the
            // break-even stays computed and stays in the report, where it
            // belongs as a description rather than a veto.
            parkRegenBreakEven: 0,
            parkRadius: 26,         // "arrived": stop moving inside this radius
            // v6.91.3: how far in from the TRUE corner the seat sits. The
            // mark-immunity geometry is 80.92 px at inset 0, 70.78 at 7.2 (the
            // live player radius, which is what the code used) and 64.03 at 12
            // (the fallback) — against a 70 px mark reach. Anything above ~10
            // puts the seat inside every mark that can spawn.
            // ── v6.122.0 FIVE DEAD CONFIG KEYS REMOVED ─────────────────────
            // Each appeared exactly once in the whole repo — at its own
            // definition. None is a CEM dimension, so nothing read them:
            //   movement.poHugPad        (the hug was retracted in 6.86.4)
            //   movement.poFocusValue    (the station uses passoutValue)
            //   movement.poBlockPenalty  (the code hardcodes 55 on the body
            //                             and 60 for a path crossing it — and
            //                             game-source-facts.md cites this key
            //                             as the shipped implementation of
            //                             'passouts are obstacles'. It is not.)
            //   deepHell.laneEscapePad   (shipped with the 6.111.0 lane escape
            //                             as 'clear the band by this much
            //                             before releasing' — there is no
            //                             release hysteresis in the override)
            //   deepHell.capLegS         (self-documented unused from 6.101.0)
            // A config key that is read by nothing is a claim about behaviour
            // that is not true, and this file is read as documentation.
            cornerInset: 0,
            freezeEntryToS: 2400,   // v6.91.4: the window where a freeze is worth double
            parkYieldS: 20,         // v6.91.4: seconds park may be suspended per frozen-boss episode
            // ── v6.117.0 THE PER-EPISODE BOUND DOES NOT BOUND ANYTHING ────────
            //
            // 6.91.4 wrote the reason this needed a limit, and it was right:
            // WHISKY SOUR "just freezes the bosses always", so a permanent
            // freeze would suspend park for the whole run. Its answer was one
            // 20 s window per frozen-boss EPISODE, keyed on the boss id.
            //
            // That bounds each episode and not the run, and the pause audit
            // says why it matters: over 675 runs and 6.78M hell ticks the field
            // is frozen on 94.5% of them. The freeze is not an episode, it is
            // the background — and every fresh boss id starts another window.
            // The census caught the result in a single row: one 4585 s run
            // spent 21,225 of its 40,561 hell ticks (52%) booking `yield`,
            // against 8,148 seated. Across the batch `yield` is 20% of all
            // misses, level with `armor`.
            //
            // A free kill is worth leaving the seat for a few times a run. It
            // is not worth half of hell. So the episode window stays and a RUN
            // budget goes on top: past this many total yielded seconds, a
            // frozen boss is the background state again and park keeps the
            // seat. Six windows.
            parkYieldRunMaxS: 120,
            // v6.91.0 DORMANT-BOSS HUNT (user: "when some boss is off-canvas and
            // the damage circle of the boss is also outside of the canvas, the
            // bot needs to hunt it down somehow before it wakes up and does huge
            // one hit damages").
            dormantHunt: true,
            // v6.91.1: measured, not guessed. Live tier-3 bosses sit 1285-1641px
            // from the player with radii 613-858; the old 900px CENTRE-distance
            // cap gathered none of them. This is how far the BODY may sit from
            // the play rectangle and still be worth tracking — player-position
            // independent, which centre distance was not.
            dormantBodyReach: 1200,
            dormantHuntS: 20,        // seconds committed to one hunt before giving up
            dormantHuntRestS: 45,    // and how long before another is allowed
            dormantHuntRadius: 20,   // "on post": stop moving inside this radius
            dormantHuntMargin: 8,    // how close to the field edge the post may sit
            dormantHuntHp: 0.6,      // never leave the seat below this HP ratio
            // v6.91.1: "wakes up" = a TIME STOP ending (user). The freeze is the
            // real deadline, so the walk home is subtracted from it rather than
            // guessed at.
            huntFrozenMinFrames: 45,  // same threshold stopBoss and frozenBossHere use
            huntVacateS: 0.75,       // slack on top of (distance home / speed)
            deepCornerFromS: 2400,
            // v6.89.8 (user): "ultimate every time it's available, for that
            // invincibility and chance to kill a potential mob — for the item
            // drops." Past this depth every crowd/HP/harvest gate on the ult is
            // bypassed and it fires on availability. The retry gate is short
            // because callGame is a no-op while the game's own cooldown runs.
            // v6.90.1: was 2400. The ult's invulnerability is worth most in the
            // phase with the highest loss rate, and that is hell entry, not depth.
            ultAlwaysFromS: 1200,
            ultAlwaysGateMs: 250,
            // v6.89.7: the spacing kite may never claim more than this SHARE of
            // the corner's own weight. Not a style preference — movement.kitePull
            // is a CEM-tuned parameter with a box max of 4.0, so any margin
            // expressed as a fixed multiple of its DEFAULT is a margin that
            // inverts itself the moment the optimiser walks the dial up.
            spacingCeilShare: 0.6,
            cornerPull: 4.0            // weight on closing to the nearest corner.
                                       // v6.89.6: was 2.4, and it was LOSING. A manual demo
                                       // digest measured cornerDist at 127px two hours in,
                                       // while the corner was supposed to be held — the flee
                                       // and escape terms were simply outbidding it. If the
                                       // corner is the doctrine it has to win the sum, not
                                       // merely appear in it.

        },

        abilities: {
            dashEnabled: true,
            dashCooldownMs: 1300,   // DEMO-TUNED: the user dashes sparingly (~0.6/min)
            dashDangerScore: 4.0,  // DEMO-TUNED: dashes are for emergencies, not locomotion
            ultEnabled: true,
            ultCooldownMs: 2500,   // retry cadence only — the game's real cooldown governs
            ultCrowd: 9,           // enemies inside nearbyRadius
            ultHpRatio: 0.4,
            // v6.86.1: how close a target must be for a NON-nuke ult to be
            // worth spending on it (pat's spray / joe's spikes are melee).
            // v6.86.10 widened 130 -> 155 on the fourth manual demo, which
            // settles the question of whether the spray can kill grown
            // passouts. It can — the limit is RANGE, not damage:
            //   9 casts with a body within 160px removed HP EVERY time,
            //     including 1.24M at 62px and 1.89M at 50px, both at ult lv3
            //   3 casts with the nearest body beyond 160px removed nothing
            //     (7.3M unchanged at 222px, 44.7M unchanged at 223px — both lv6)
            // The two effective casts furthest out were 136px and 153px, so
            // the useful edge sits just under 160.
            ultAdjacent: 155,
            // ── v6.111.0 THE ULT ECONOMY, RE-DERIVED ─────────────────────
            //
            // A retracted finding first, because it drove the plan for this
            // version until the arithmetic refused it. The n=1250 phase rows
            // put bot day `inv` at a median of 0.103 against the manual joe
            // demo's 0.326, and that looked like a 3.9x cadence gap. It is
            // not a gap at all: the two numbers measure different things.
            //   demo `inv` (06-abilities-panel-boot demoTick) counts
            //     ultUntil || ultSpiralUntil || player.invuln > 0
            //   bot `inv` (05-movement, the planTicks accumulator) counts
            //     ultInvuln alone — ult windows, no hit frames.
            // `player.invuln` is the 38-frame post-hit window, so the human's
            // 0.326 is mostly EVIDENCE OF BEING HIT, and the bot's 0.103 is
            // ult uptime with the hit frames stripped out.
            //
            // Against the real ceiling the bot is not far off. ULT_CD is 80 s
            // scaled by player.ultCdMul; joe's aura window is 8+0.8*(lv-1) s,
            // so at lv1 and cdMul 1 perfect cadence is 8/80 = 10%, and at lv6
            // 12/80 = 15% (deep-hell-model.md, retraction 1). A measured
            // median of 0.103 with a max of 0.161 is a bot already firing at
            // or near cooldown. There is no 4x here — maybe 30-40%.
            //
            // So cadence is not the lever. The two terms that actually set
            // ult uptime are the WINDOW (ult level) and the COOLDOWN
            // (ultCdMul), and both are bought with picks:
            //   * pat demo 2 vs demo 1 — the cleaner run differed in one
            //     variable, ult lv6 by 14:52 vs lv5 by 18:17. lv6 casts wiped
            //     million-HP fields outright where lv1-3 casts chipped.
            //   * TOMATO JUICE is throughput: four picks bought 14 casts in
            //     20 min against 12 with none (75 s cadence vs 98 s).
            // The scorer paid +200 for the ult only below lv3 and nothing
            // after, which stops exactly where demo 2's advantage begins.
            //
            // Indexed by CURRENT ult level, so entry `lv` is what a card
            // raising lv -> lv+1 is worth. 0-2 hold the old +200 so nothing
            // below lv3 changes; the tail is new.
            ultSpineByLv: [200, 200, 200, 150, 120, 90],
            // v6.118.0 THE REGEN SPINE. Paid to WATER and SIMPLE SYRUP alike
            // while regen sits below deepHell.parkRegenRate, scaled by how far
            // short it is: 240 at zero regen, nothing once the floor is met.
            //
            // Sized against the things it has to beat and the thing it must
            // NOT beat. The picks audit shows a day-order ingredient landing
            // at 101 (`day-order10+101`) and a weapon level-up at 70-105, so
            // 240 wins those outright — which is the user's own reading of the
            // early game: "water instead of tonic could have been a better
            // early pick". The ult spine pays 240-320 on top of `ultimate+320`
            // for a total near 700, so the ult still leads. Order at zero
            // regen: ult > regen > roster.
            regenSpine: 240,
            // v6.123.0 ENTRY-REGEN CHECKPOINT weights (see
            // movement.entryRegenFromS for why this is a gate and not a dim).
            // Sized against the roster this actually has to beat, measured on
            // the built script rather than guessed. Day scene at gt 1100,
            // WATER level 2 (regen 0.568 — the never-parked median), armour at
            // the 34.992 cap, `strategy.regenDeficit` FORCED TO 0 so the size
            // is the checkpoint's own and not the CEM's:
            //     WATER 241   MINT 294   SUGAR 291   TONIC 281
            //     DRY VERMOUTH 247   NEGRONI 254   GIN TONIC(lv3) 183
            // The first draft was 90. That put WATER at 289 against SUGAR 291
            // — it lost by two points with the dim at zero, which is the exact
            // failure this version exists to prevent. 120 clears the whole
            // roster outright and still sits far under the ult.
            //
            // The early tier is deliberately NOT enough to lead. Measured in
            // the same scene at gt 800, WATER's base is 199, so the band that
            // clears the mid-roster (DRY VERMOUTH 247, NEGRONI 265) without
            // overturning the top of the day order (MINT 278, TONIC 281,
            // SUGAR 291) is 66..79. 72 is its midpoint. The user's doctrine
            // has MINT leading and a regen checkpoint must not quietly
            // overturn it; the graded shape mirrors entry-armor's 18/40.
            //
            // The whole cost is bounded by the release: the gate closes at
            // regen >= 1.0 and 0.284*4 = 1.136 is the first rung over it, so
            // from the seated group's level 2 it buys TWO levels and from the
            // never-parked group's zero it buys four.
            //
            // PRE-REGISTERED FOLLOW-UP, so the next version is one variable
            // and not a rewrite: entryPrepFromS is 1050 and hell latches at
            // 1200, so the leading tier gets ~150 s — often not even one
            // level-up, which is the exact complaint that took entry-armor
            // from 6.99.2 to 6.105.0. If the next batch shows the WATER ladder
            // still stalling below 1.0 at entry, the single move is to raise
            // THIS number into the leading band, not to touch anything else.
            // v6.124.0 RETRACTED — the pre-registered abort fired. The
            // 6.123.0 row at n=90 reads median 1260 -> 1012, dayClearRate
            // 0.53 -> 0.44, supersPerRun 1.2 -> 0.9, z = -2.04 "worse"
            // against 6.122.0, while the seat itself stayed bimodal (entry
            // regen 2.22 / 1.42 / 0 / 0 across the four hell rows; the
            // 3107 s run never parked at all: parkMiss.regen 57186 of
            // 57186). The checkpoint bought WATER with the supers that make
            // the seat survivable. Both weights go to 0 — the mechanism and
            // its teeth stay (the scenario sets them explicitly) so it can
            // be re-armed at a smaller size on a clean baseline later.
            entryRegen: 0,
            entryRegenEarly: 0,
            // v6.124.0 CLAIM BEFORE YOU LEVEL (03-scoring.js handleLevelUp).
            // Not a weight: a rule that an unclaimed plan cocktail beats a
            // base-attack LEVEL-UP when that is the only card above it, day
            // only. `false` restores the 6.123.0 behaviour exactly.
            claimBeforeLevel: true,
            // v6.111.0: the day retry gate. The game's own cooldown is the
            // real limiter (53-80 s), so a tighter retry only shaves the
            // latency between the cooldown ending and the bot noticing. At
            // 1500 ms that is worth ~1% of casts — small, free, and the
            // honest size of the cadence prize.
            ultDayRetryMs: 1500
        },

        learning: {
            storageKey: 'pineBotUCB_v5',
            c: 1.25,               // UCB exploration constant (item bandit)
            baselineWindow: 12,
            decay: 0.985,
            tuningWarmupRuns: 3,
            // v6.107.0 LEARNED PER-TYPE THREAT MULTIPLIER (see typeMul() in
            // 05-movement for the full history). The store may hold 0.6-2.2;
            // these bound what is actually APPLIED to the danger field.
            // The 6.85.22 failure was the bot fearing ordinary mobs at 2.2x
            // and refusing to farm — a 1.4 ceiling makes that unreachable.
            enemyMulApply: true,   // one live dial: false restores static fear
            enemyMulMinN: 8,       // sole-candidate contact events before a type counts at all
            enemyMulFloor: 0.8,
            // v6.115.0: was 1.4, and BOTH of the two types that do the killing
            // were pinned against it — drunk stored 1.404 / applied 1.4,
            // runner 1.417 / applied 1.4, on 149k and 139k sole hits. A clamp
            // that binds on the two highest-evidence types is a box that is
            // too small, exactly like the CEM bounds this project keeps
            // widening. 1.8 gives the estimate room to say what it measured;
            // the floor is untouched because nothing is near it.
            enemyMulCeil: 1.8,
            // CEM (Cross-Entropy Method) optimizer for movement/dodge params:
            // sample from a Gaussian per parameter, batch runs, refit the
            // distribution toward the top-ranked runs. Rank-based selection
            // is robust to this game's noisy rewards in a way that comparing
            // per-candidate means never was.
            batchSize: 10,         // runs per generation (shared across tabs)
            eliteFrac: 0.3,        // top fraction of the batch that shapes the refit
            sigmaInit: 0.25,       // initial exploration: fraction of each param's range
            sigmaFloor: 0.05,      // exploration never collapses below this
            // v6.86.0 anti-lockup (see 02-learning: hofRecord / maybeRestart)
            hofMergeDist: 0.02,    // hof vectors closer than this (mean |delta|/range) are the SAME point
            autoRestart: true,
            restartAfterStalledGens: 6,
            restartSigma: 0.25,    // reopened sigma as a fraction of each box
            anneal: 0.98,          // per-generation exploration shrink: each iteration refines, not re-guesses
            // v6.98.0 THE RATCHET, CONVICTED AND DISARMED. deathNudge pushed
            // the dominant killer's DEATH_POOL parameters up by >=3% of range
            // every generation, clamped only at the box edge — and it
            // modifies the MEAN, which every restart/reseed preserves. Joe's
            // gen-106 probe showed the exact contact pool pinned at box max
            // (standoff 190/190, standoffPull 1.8/1.8, panicHp 0.62/0.62,
            // enemyRange 240/240, enemyWeight 2.15/2.2) with sigma annealed
            // shut: a hyper-cautious zero-super bot, dayClear 0.01 over 865
            // runs, line deaths 12% (lineWeight drifted to 3.1 while the
            // ratchet ate the caution budget). This is the 6.92.3 runaway
            // one level up. Elite refit already learns defense WHEN IT HELPS
            // SURVIVAL; an unbounded exogenous push does not belong in the
            // loop. 0 disables (the mechanism stays, config-toothed); do not
            // re-enable without adding decay back toward the elite mean.
            deathNudge: 0,
            // roster bandit (rosterExperiment): explore/exploit over WHOLE
            // cocktail rosters, on the run-reward scale (~0.2 - 2.5)
            rosterExplore: 0.25,       // UCB width — how eagerly untried rosters get auditions
            rosterIncumbentEdge: 0.05,  // the user's prescribed build starts ahead by this much
            // VERSION SNAPSHOTS: how many frozen per-version records to keep,
            // and how many best runs each version remembers.
            snapshotKeep: 24,
            // v6.88.0 AUDIT R1/C2. versionKeep bounds the SHARED comparison
            // table, which was unbounded and is what eventually blows the
            // origin quota (~3.7 KB per row once its 600-run time ring fills).
            // minMeaningfulRuns is the significance floor the tables now print
            // for themselves — every historical misreading in this project came
            // from taking a row under it seriously.
            versionKeep: 40,
            minMeaningfulRuns: 20,
            versionTopRuns: 5,
            versionTimesKeep: 600,     // per-version survival-time list (median / SD); oldest dropped past this
            // v6.96.2 STORE GUARDS (the joe store died 2026-08-29: 153 runs /
            // 44 generations reset to defaults at a page reload — the primary
            // blob failed to parse and loadLearnInner's silent catch answered
            // with a fresh store). Every successful own-store save now also
            // writes a `__bak` copy, the loader heals from it when the
            // primary is missing or unreadable, and a quota throw on save
            // TRIMS the store's own bulk and retries instead of losing the
            // run. demoCapBytes bounds the 🎥 recording blob, which at
            // 2.66 MB was 91% of the bot's whole storage footprint.
            demoCapBytes: 900000
        },
        // v6.96.2 PHASE AUDIT thresholds (user: "get the data of how it
        // survived day mode and hell and deep hell mode"). A run's phase is
        // where it ENDED: 'day' = hell never latched; 'entry' = died within
        // entryS seconds of the hell latch (the surge the entry seat exists
        // for); 'hell' = died before deepFromS; 'deep' = past deepFromS —
        // the parked-equilibrium regime (a 12000 s cap-out books here).
        // v6.112.0 — the mitigation constants, read from the game source and
        // named here instead of living as literals in three comments. See
        // contactBreakEven(); mitigation-model.md carries the derivations.
        mitigation: {
            // ── v6.122.0 THE 33-vs-38 DISCREPANCY IS STILL OPEN ────────────
            // An audit proposed changing this to 33 on the strength of
            // `game-source-facts.md` ("the invuln window is 33 frames, not
            // 38"). NOT TAKEN. The project's own record contradicts itself and
            // says so explicitly: `mitigation-model.md` reads the source as
            // `hurtPlayer` setting `invuln = 38` and lists, under Open
            // Questions, "3. The 33 vs 38 frame invuln discrepancy
            // (`hurtPlayer` writes 38)."
            //
            // 38 is a DIRECT SOURCE READ. 33 was INFERRED from a measured hit
            // rate, which a hit landing on the frame invuln expires would
            // bias downward. A direct read outranks an inference, and neither
            // outranks an actual re-read of `hurtPlayer` — which is what
            // settles this and has not been done.
            //
            // Cost of being wrong: contactBreakEven() reports 1.579 HP/s
            // instead of 1.818, a 15% understatement of the seat's drain.
            // Inert as a gate today (parkRegenBreakEven: 0).
            invulnFrames: 38,   // hurtPlayer sets player.invuln on the PLAYER, not per attacker
            contactDmg: 22.4    // flat common-mob contact, before armour subtraction
        },
        phaseAudit: {
            entryS: 300,
            // v6.112.0: KEPT, but demoted. `deepFromS` still labels the phase a
            // run ended in, so every historical row stays comparable — but it
            // is no longer the success signal. The regime below is. See
            // deepRegime and the accumulators in 05-movement.
            deepFromS: 7200,
            // How long the regime must be HELD before a run counts as having
            // reached it. A couple of ticks of ringHuge while walking past a
            // corner is not deep hell; two continuous minutes of anchored,
            // ult-sustained, zero-movement survival is exactly what the user
            // described. Read `medianDeepHold` before trusting this number —
            // if holds cluster far above or below it, move it to the data the
            // way capStable.fromS was moved to medianReadyAt in 6.103.0.
            deepHoldS: 120,
            keep: 240              // rows kept (~120 bytes each)
        },
        // v6.112.0 THE REGIME PREDICATE, in the user's own four clauses.
        // Each maps to a signal the planner already computes:
        //   "bosses being too large"   -> ringHuge (boss diameter >= 55% of canvas)
        //   "stop giving tips"         -> gt >= deepHell.tipWindowToS (4800)
        //   "corner anchoring works,
        //    no movement required"     -> parked (park/seat zeroes velocity)
        //   "fires ultimates to keep
        //    itself alive"             -> measured as deepInv, NOT gated on
        // The fourth is deliberately a QUALITY measure rather than a gate: if
        // the regime is held with a low ult share, that is a finding about how
        // the anchor survives (armour, not ults), and gating on it would hide
        // exactly that. requireRing/requireTips exist so the two hard clauses
        // can be relaxed one at a time when reading a row, never silently.
        deepRegime: { requireRing: true, requireTips: true, requireParked: true },
        // v6.115.0: how the boss census samples radius over a run. See the
        // comment at the sampler — the first window (12 x 30 s) was far too
        // short to see growth that bossHitRange proves is happening.
        // (placed on deepHell below; kept here only as documentation anchor)

        // Strategy weights. These are CEM-TUNABLE (see TUNABLE below), so the
        // strategy itself — not just the dodge physics — improves across runs.
        strategy: {
            deepFocusLv: 4,        // v6.86.0 (was 5): above 4 the roster never completes a super recipe
            roadmapBonus: 16,      // pull toward the USER'S prescribed rainbow roster
            earlyDps: 12,          // extra weight on leveling owned weapons early
            expandPenalty: 20,     // deep-focus penalty on new cocktails
            // v6.114.0: bonus a regen card earns at ZERO regen, decaying to 0
            // at contact break-even. Default 120 puts WATER around 338 and
            // SIMPLE SYRUP around 351 against OLIVE's 432 and a base-attack
            // card's 560 — ahead of junk and of a third weapon level, behind
            // the armour anchor and the ult. Searchable; see TUNABLE.
            // 40, not 120. At 120 a regen card scored 319 against super keys
            // at 247-278 — it outbid the super line, and supersPerRun (0.5
            // against a supersMin of 3) is the binding constraint on every
            // build. `slot-lockout` holds that invariant. 40 keeps regen ahead
            // of junk and behind the super keys, the armour anchor and the
            // base attack. The BOX runs to 220: if the HP economy really is
            // worth more than the super line, the search can say so with
            // evidence instead of me asserting it.
            regenDeficit: 40,
            dpsDeficitGain: 28,    // how hard picks shift to damage when losing the DPS race
            // USER + CEM: the Rainbow Gun pickup time. The gun starts weak —
            // too early = contact death, too late = kiting can't cover. The
            // optimizer LEARNS the ideal moment from run rewards.
            rainbowReadyS: 1500
        },

        // Reward blend — matches the game's own scoreboard — plus milestone
        // shaping so learning climbs toward the actual goals.
        scoring: { time: 0.5, downs: 0.3, sales: 0.2 },
        normalize: { time: 900, downs: 900, sales: 60000 },
        // hellDepth: the plain time term saturates at ~24 min, which made a
        // 30-min and a 100-min hell run look identical to the optimizer.
        // This term keeps rewarding every extra half-hour of hell survival —
        // the crown (126 min) needs an unsaturated signal to climb toward.
        // crownProgress: the ONLY unbounded, linear term. Survival time is the
        // win condition, so it must never stop producing gradient — a run at
        // the crown scores +2.0 here, a run at half the crown +1.0, and there
        // is no ceiling above it.
        // v6.86.9: `rainbow` was worth +0.5 of a ~2.0 reward — the optimiser
        // was being PAID for the thing the scoring vetoes. Zeroed.
        // v6.91.6: `crownRefS` is the DENOMINATOR of the crown-progress term. It
        // is deliberately a FIXED reference, not the live crown. The term exists
        // to give unbounded LINEAR gradient at every second of a run; tying it to
        // an external number the user can move means the optimiser's incentive
        // silently rescales whenever a manual run lands on the board — which is
        // precisely what happened on 26 Aug. 15150 is the old board time, i.e.
        // the horizon the bot is actually competing in (its best ever is 15390).
        // The LIVE crown is still read for the STOP threshold, which is its
        // correct use: knowing when a run has actually won.
        // v6.108.0 `immortal` — the fix for a bias that was silently
        // punishing the best builds. `capFiredThisRun` was written to the
        // phase row and read NOWHERE else, so a capped run booked its
        // TRUNCATED reward into the CEM and all four bandits exactly as if it
        // had died at the cap. hellTimeBonus is 1.79 at 9000 s against 0.42
        // at 2100 s, so every time the protocol got better at ending immortal
        // runs early it told the optimizer the immortal build was worth ~1.3
        // LESS. Cap aggressively without this and the search walks away from
        // the very build we are trying to find — and it would read as an
        // unexplained regression.
        // Paid once, for a run the protocol PROVED stable or saturated (not
        // for a plain clock-cap timeout, which proves nothing). Sized at 1.3
        // to cancel the truncation it replaces, so proving immortality at 35
        // minutes scores like surviving to 150.
        milestones: { superUnlock: 0.06, craft: 0.05, dayCleared: 0.25, hellEntered: 0.15, rainbow: 0, hellDepth: 0.25, crownProgress: 2.0, crownRefS: 15150, immortal: 1.3 },

        hellModeRegex: /\bHELL\b/i,
        stopOnHellRecord: true,
        // The standing rank-1 hell time in seconds. Any ranked hell run that
        // exceeds it is treated as a #1 outright, independent of whether the
        // results board can be parsed. Read live from the game's own hell
        // board when available (paco_bdh_time), so it tracks the real crown
        // as it moves; this constant is the fallback.
        //   board as of now: ISLASAMCHON 233:45 (minguk) — the bar to beat.
        crownTimeS: 14025,   // stop for manual name entry on a Hell-mode record
        stopOnTopRecord: false,   // normal closing-time records are ignored; set true to also stop on a rank-#1 run
        autoEnterHell: true,      // after surviving the 20-minute day, go straight into Hell mode

        canvasSelector: 'canvas',

        // v6.85.22 — hand-tuned constants promoted to CEM-searchable knobs.
        // Every value here was set by eye or from one demo during the
        // 6.85.x calibration; the CEM can now optimise them against the
        // actual run reward instead. Defaults = the shipped 6.85.21 values.
        patRing: { early: 165, mid: 90, late: 80 }
    };

    // =================================================================
    // GROUND-TRUTH DATA (from the in-game recipe book)
    // =================================================================
    const BARTENDERS = ['pat', 'joe', 'minguk'];
    const BARTENDER_TO_BASE_ATTACK = { pat: 'SHAKING', joe: 'STIRRING', minguk: 'AGAVE' };
    // LIVE-READ BASE STATS (player.maxHp / player.speed at t=0, 2026-08-21).
    // `tank` = survive by absorbing (HP/armor/shield); `runner` = survive
    // by spacing (only meaningful before enemy speed passes ours, ~minute 8).
    // PAT CALIBRATION — from manual demos recorded with the 🎥 recorder
    // (2026-08-21): three full day runs and two runs deep inside hell.
    // Method: percentiles over EVERY sample carrying the field, not
    // eyeballed stationary stretches. p25 is the estimator that matters for
    // a farming station — the median is inflated by transit between
    // passouts, and the p75 is pure transit.
    //   * dayRing: he farms from far out in the opening minutes and TIGHTENS
    //     as the build matures — the bot was holding a flat 118/112/105.
    //     poD p25 per day run:
    //         window        run A   run B   run C     shipped
    //         0-180s         166     138     115       165
    //         180-600s        78      96      96        90
    //         600-1200s       71       —      74        80
    //     v6.85.2 shipped 130/72/62 from eyeballing run A alone; v6.85.4
    //     fixed the opening to 165 but left mid/late at 75/66, which sit
    //     BELOW every run's p25 — i.e. tighter than the human ever parked.
    //     v6.85.5 raises them to 90/80. Early day is where ~29% of runs die,
    //     so erring tight there is the worst direction to be wrong in.
    //     n=3 — provisional, not settled.
    //   * crowdPanic: he held station through waves of 50-99 near at 100 HP
    //     (day) and 102-156 near (hell) without losing a point. Crowd count
    //     is not a threat for a tank with freeze up; HP is the only gate.
    //   * kiteMul back to 1.0: CEM's own gradient has movement.kitePull at
    //     corr +0.41. Cutting it to 0.7 in 6.85.0 was a guess the data rejects.
    //   * bossFloor: RETRACTED in v6.85.5, back to 0. 6.85.2 set it to 150 on
    //     the claim that every damage event in the first hell run happened at
    //     bossD < 140. The second hell run refutes that — bossD at the moment
    //     of damage runs p25 181 / med 264 / p75 294, with big hits landing at
    //     537 and 376. Hit-bossD medians across the two runs: 156 and 264.
    //     Whatever is hurting him in hell is ranged or a telegraph, not
    //     contact and not a swarm (hitNear med 2), so a standoff floor cannot
    //     reach it and only costs uptime. Left in the code as a profile knob.
    //   * ultFalloff (v6.85.8, user): PAT's ultimate is NOT minguk's. It
    //     spirals OUTWARD from the bot and the passouts nearest the origin
    //     take the most damage. A flat centroid is therefore the wrong aim
    //     point — it averages a spread-out group into a spot that is far from
    //     all of them. With falloff the aim is the proximity-weighted centre,
    //     which collapses onto the densest nearby cluster, and a single
    //     passout at point-blank is already a good ult. Left false for the
    //     others: only Pat's shape has been described.
    // dayRing/bossFloor/crowdPanic are null/true/0 for the runners: minguk's
    // 118/112/105 curve is HIS OWN calibration and is left untouched.
    const CHARS = {
        // v6.86.1 ULT KINDS — read out of the live game source, not inferred.
        // The three ultimates are different WEAPON CLASSES and the old
        // "fire it at passouts/walls/bosses" doctrine only ever described
        // minguk's:
        //   nuke  (minguk) useUltimate -> claseUlt -> for(const e of enemies)
        //         dealDmg(e, 1e7 * 2.5^(lv-1)), commented "passout 포함" —
        //         field-wide, range-independent, one-shots ANY passout.
        //   spray (pat)    ultSpiralUntil: rotating arms emit projectiles at
        //         dmg*9.6*2^(lv-1) every 3 frames for (1.4+0.13*lv)*1.3 s,
        //         plus invulnerability for the same window. Omnidirectional
        //         and short — it only pays on what is ALREADY adjacent, and
        //         it cannot burn down a passout at range.
        //   aura  (joe)    ultUntil: 8+0.8*(lv-1) s of invulnerability with
        //         spikes every 14 frames at radius ~= player.r + 149 for
        //         max(dmg,72)*15.6*2.2^(lv-1) — a huge MELEE window that
        //         only pays while standing in the crowd.
        // v6.87.0 kiteChasers / fleeNear (user: "pat and minguk's movement and
        // anchoring and engagement of enemies should also have been different").
        //   kiteChasers — how big the chase train must be before the bot stops
        //     holding its ring and starts sweeping tangentially. Kiting is a
        //     SPEED bet: it only works if you outpace what follows you.
        //   fleeNear — crowd size that turns unkillable-hell pressure into
        //     outright flight. Same bet, at the other end of the run.
        // Pat is 1.9 speed — the slowest thing on the field once hell scales
        // spawns past 25 speed. Running is not an option he has; his answer is
        // 180 HP, maxed OLIVE/NEGRONI, and the invulnerability window on his
        // ult. So he commits later on both counts and holds his ring instead.
        pat:    { hp: 180, speed: 1.9,   style: 'tank',   kiteMul: 1.0, anchorBias: 1, panicMul: 0.85, mitigationTilt: 10,
                  dayRing: { early: 165, mid: 90, late: 80 }, crowdPanic: false, bossFloor: 0, ultFalloff: true,
                  kiteChasers: 4, fleeNear: 6,
                  ultKind: 'spray', ultReach: 150, ultClearsPassouts: false },
        // Joe at 3.0 is the purest kiter of the three (and the frailest at
        // 100 HP): he commits earliest to both.
        joe:    { hp: 100, speed: 3.0,   style: 'runner', kiteMul: 1.1, anchorBias: 0, panicMul: 1.1,  mitigationTilt: 4,
                  dayRing: null, crowdPanic: true, bossFloor: 0, ultFalloff: false,
                  kiteChasers: 2, fleeNear: 3,
                  // v6.99.0: ultClearsPassouts corrected to TRUE — the manual
                  // joe demo (6.98.0, 1997s) shows the aura wiping ADJACENT
                  // passout piles repeatedly (poCount 3→0 at gt 155/361,
                  // 1→0 at gt 717/1120, bodies up to 3.2M HP). NOTE this flag
                  // is documentation-only: every live gate keys off ultKind
                  // (nuke = field-wide, spray/aura = adjacent-only). It was
                  // set false in 6.86.1 when aura ults were wrongly taken off
                  // the passout list entirely; 6.86.2 restored adjacency but
                  // the flag was never corrected, and it misleads analysis.
                  ultKind: 'aura', ultReach: 156, ultClearsPassouts: true,
                  // v6.94.0: source-verified — joe's barspoon pierces 8
                  // bodies. fireBase aims at the NEAREST enemy, so whatever
                  // stands BEHIND the target is also hit; the pierce-align
                  // term in 05 turns that from luck into positioning.
                  pierce: 8,
                  // v6.95.1 THE FRAGILE PROFILE (user chose to keep joe in
                  // the rotation; the data demanded a doctrine). Joe is the
                  // only bartender with ZERO innate regen (source-verified:
                  // the base term is pat||minguk), on 100 HP with no splash.
                  // Every chip hit is PERMANENT until a heal drops, which is
                  // why n=31 on 6.94.1 read median 360s with 25/31 contact
                  // deaths. His doctrine: approach overrides (harvest/trek)
                  // only with MEASURED armor >= 23 (the 4-OLIVE floor where
                  // flat 22.4 contact nearly zeroes) AND hp >= 80%; a boss
                  // mark is soakable only behind a real NEGRONI shield; and
                  // heals turn VITAL at 75% instead of 60%.
                  approachDefense: 23, approachHp: 0.8, markShield: 30, healVital: 0.75 },
        // Minguk's whole doctrine is "outrun everything on natural speed":
        // 2.375 with a nuke that needs no positioning at all. Kiting and
        // fleeing are his primary tools, not his last resorts, so he keeps the
        // historical thresholds that competed for the crown.
        minguk: { hp: 120, speed: 2.375, style: 'runner', kiteMul: 1.0, anchorBias: 0, panicMul: 1.0,  mitigationTilt: 0,
                  dayRing: null, crowdPanic: true, bossFloor: 0, ultFalloff: false,
                  kiteChasers: 3, fleeNear: 4,
                  ultKind: 'nuke', ultReach: Infinity, ultClearsPassouts: true }
    };
    // The bartender is chosen PER RUN (rotation or bandit), so everything
    // keyed on it — learned store, version tag, posture profile — is a
    // function of `activeChar`, never a load-time constant.
    let activeChar = (CONFIG.preferredBartender && CHARS[CONFIG.preferredBartender]) ? CONFIG.preferredBartender
        : (Array.isArray(CONFIG.bartenderRotation) && CONFIG.bartenderRotation.length ? CONFIG.bartenderRotation[0] : null);
    const charOf = () => CHARS[activeChar || 'minguk'];
    function nextRotationChar() {
        const rot = (CONFIG.bartenderRotation || []).filter(b => CHARS[b]);
        if (!rot.length) return null;
        let i = 0;
        try { i = parseInt(localStorage.getItem('pineBotRotIdx') || '0', 10) || 0; } catch (e) { }
        const b = rot[i % rot.length];
        try { localStorage.setItem('pineBotRotIdx', String((i + 1) % rot.length)); } catch (e) { }
        return b;
    }

    // v6.88.0 AUDIT D1: every key here is UPPERCASE because baseNameOf()
    // uppercases the card name before any lookup. 'CORPSE REVIVER No.2' was
    // mixed case in six tables, so AVOID_COCKTAILS.has(), COCKTAILS.includes(),
    // SUPER_KEY_INGREDIENT, WEAPON_TAGS and COCKTAIL_PRIORITY all MISSED for
    // it: the user's "absolute junk pile" directive never fired, and taking the
    // card left ownedCocktailCount() at 0 — which re-triggered the first-weapon
    // bonus and suppressed OLIVE's two largest bonuses for the rest of the run.
    // DEAD_VS_HOLDOUTS already carried both spellings, evidence this was hit
    // once and patched at one site only. Keep new entries uppercase.
    const COCKTAILS = [
        'GIMLET', 'MANHATTAN', 'OLD FASHIONED', 'SIDECAR', 'MOJITO', 'COSMOPOLITAN',
        'GIN TONIC', 'WHISKEY HIGHBALL', 'VODKA TONIC', 'VODKA CRANBERRY', 'SOUTH SIDE',
        'MARGARITA', 'DRY MARTINI', 'VODKA MARTINI', 'MOSCOW MULE', 'WHISKY SOUR',
        'NEGRONI', 'BLOODY MARY', 'ESPRESSO MARTINI', 'CORPSE REVIVER NO.2'
    ];

    // Cocktail -> the ingredient that must be MAXED to unlock its super form.
    const SUPER_KEY_INGREDIENT = {
        'GIMLET': 'LIME', 'MANHATTAN': 'SWEET VERMOUTH', 'OLD FASHIONED': 'ANGOSTURA',
        'SIDECAR': 'COINTREAU', 'MOJITO': 'SUGAR', 'COSMOPOLITAN': 'ORANGE',
        'GIN TONIC': 'TONIC', 'WHISKEY HIGHBALL': 'WATER', 'VODKA TONIC': 'TONIC',
        'VODKA CRANBERRY': 'CRANBERRY', 'SOUTH SIDE': 'MINT', 'MARGARITA': 'ORANGE',
        'DRY MARTINI': 'OLIVE', 'VODKA MARTINI': 'DRY VERMOUTH', 'MOSCOW MULE': 'GINGER BEER',
        'WHISKY SOUR': 'LEMON', 'NEGRONI': 'CAMPARI', 'BLOODY MARY': 'TOMATO JUICE',
        'ESPRESSO MARTINI': 'COFFEE BEANS', 'CORPSE REVIVER NO.2': 'ABSINTHE'
    };

    // Secret crafts: every part at Lv6 fuses into the result.
    const EVOLUTIONS = [
        { parts: ['WATER', 'SUGAR'], result: 'SIMPLE SYRUP' },
        { parts: ['LEMON', 'LIME', 'ORANGE'], result: 'CITRUS TRIO' },
        { parts: ['SODA WATER', 'GINGER BEER', 'TONIC'], result: 'SODA GUN' },
        { parts: ['SWEET VERMOUTH', 'DRY VERMOUTH'], result: 'BLACK VERMOUTH' }
    ];

    // Two-part fusions the build actively pursues: each frees an ingredient
    // slot (two consumed, one returned) — see the craft-pair engine below.
    const CRAFT_PAIRS = [['SWEET VERMOUTH', 'DRY VERMOUTH'], ['SUGAR', 'WATER']];

    const COCKTAIL_PRIORITY = {
        'GIN TONIC': 34, 'VODKA TONIC': 32, 'COSMOPOLITAN': 30, 'WHISKEY HIGHBALL': 30,
        'SOUTH SIDE': 28, 'DRY MARTINI': 27, 'VODKA MARTINI': 27, 'NEGRONI': 26,
        'CORPSE REVIVER NO.2': 26, 'WHISKY SOUR': 25, 'ESPRESSO MARTINI': 18,
        'MARGARITA': 23, 'MOSCOW MULE': 23, 'MOJITO': 22, 'SIDECAR': 22,
        'MANHATTAN': 21, 'OLD FASHIONED': 21, 'GIMLET': 20, 'VODKA CRANBERRY': 19,
        'BLOODY MARY': 18
    };

    // THE RAINBOW ROADMAP — SELF-COMPOSING. Seeded from 464 runs of measured
    // data (vermouth line: MANHATTAN 1.16 + VODKA MARTINI 1.05 -> BLACK
    // VERMOUTH; syrup line: WHISKEY HIGHBALL 1.07 + MOJITO 1.13 -> SIMPLE
    // SYRUP; soda pair: GIN TONIC + VODKA TONIC sharing one TONIC), then
    // RE-DERIVED every run by computeRoadmap() from live build statistics:
    // measured win-rate first, shared super-keys and cheap craft pairs as
    // tiebreakers. The plan itself keeps learning.
    // v6.88.2 ROSTER (user): VODKA CRANBERRY replaces MOSCOW MULE. Both are
    // the same lipstick-whip archetype and share the lifesteal line verbatim
    // (steal = 1.356 * min(0.5, 0.2+(lv-1)*0.06), healBudget 2.71/projectile),
    // but read side by side in fireCocktail the cranberry wins every axis:
    //   damage    110*P  vs  66*P
    //   knockback 1.0    vs  0.7   ("★넉백 -30%" in the mule's own comment)
    //   control   cFreeze 45  vs  cSlow 40
    // The mule's only edge is projectile speed (outSp 9 vs 8). It also fits the
    // plan better: the cranberry's super key is CRANBERRY, already in the
    // ingredient list, where the mule's is GINGER BEER, which is not.
    // CAVEAT, recorded honestly: the 4400-run table does NOT show this. MOSCOW
    // MULE is primary in more deep runs (15210, 14940, 14040) than VODKA
    // CRANBERRY (15348, 5753). That is confounded — knockback-to-6 boosts the
    // mule, so the bot picks it more often — but the source numbers are the
    // only evidence on the cranberry's side. Judge on mark/contact death share
    // and p60, and be ready to revert.
    let PLAN_COCKTAILS = ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'MOJITO', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'];
    let PLAN_INGREDIENTS = ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CRANBERRY', 'SUGAR', 'WATER', 'COFFEE BEANS'];

    // USER AVOID LIST: never pick these UNLESS the pool offers nothing else
    // from the priority roadmap ("ignore ... unless no other ingredients in
    // the priority roadmap appear"). Enforced in scoreCard per-pool, and these
    // cocktails are excluded from experiment rosters and self-composition.
    const AVOID_COCKTAILS = new Set([
        'GIMLET', 'MANHATTAN', 'OLD FASHIONED', 'SIDECAR', 'WHISKEY HIGHBALL',
        'MARGARITA', 'ESPRESSO MARTINI', 'CORPSE REVIVER NO.2',
        // MINGUK guard: these two would complete a SIXTH super off in-plan
        // keys (SUGAR, OLIVE) and summon the gun — banned by design
        'MOJITO', 'DRY MARTINI'
    ]);
    // WATER is NOT banned (user): WATER + SUGAR craft into SIMPLE SYRUP,
    // which opens the ingredient pool toward TOMATO JUICE (ult cooldown).
    // v6.86.8 (user-verified): these cannot damage the stationary targets —
    // passouts and NO BOOKING walls — that the day phase is spent clearing.
    // They are the bottom of the junk tier, below ordinary filler.
    const DEAD_VS_HOLDOUTS = new Set(['CORPSE REVIVER NO.2', 'ABSINTHE']);
    const AVOID_INGREDIENTS_BASE = ['COINTREAU', 'ABSINTHE', 'LEMON', 'ORANGE', 'ANGOSTURA', 'GINGER BEER',
        // v6.92.0: CAMPARI was on NO list at all, and the live run bought it to
        // Lv6 and evolved NEGRONI — the keyless occupant that must never super.
        'CAMPARI'];
    // v6.88.3 (user): "lime, soda water can be junk pool picks". They are not
    // plan ingredients and never will be, but when the pool is all junk they
    // are a better answer than CORPSE REVIVER No.2 or ABSINTHE, which cannot
    // damage holdouts at all. Ranked ABOVE true junk, below anything planned.
    const JUNK_ACCEPTABLE = ['LIME', 'SODA WATER'];
    // v6.88.3 (user): Lv6 cocktails that earn their slot WITHOUT a super key.
    // v6.89.3 (user): "for non super cocktails negroni is the only essential."
    // WHISKY SOUR and VODKA CRANBERRY are off the roster now, so boosting them
    // would be boosting cards the plan no longer wants a slot spent on.
    // v6.91.4 (user): "whisky sour doesn't need to be a super cocktail to be
    // useful" — and "whisky sour seems crucial when time pause is not available
    // and late level bosses can one hit the bot at early to mid hell".
    //
    // That is the whole point of this list, and 6.89.3 removed WHISKY SOUR from
    // it on the reasoning that its LEMON key is off-plan. Off-plan is the
    // PREMISE here, not the objection: these are cocktails whose base effect
    // pays for the slot on its own.
    //
    // The freeze is the only hard counter to a boss that one-hits, and it is the
    // only freeze the BUILD can carry — TIME STOP is a pickup, not something the
    // roster owns. Everything downstream already understands it: `frozen` is
    // `e.frozenUntil > frame` (WHISKY SOUR, per enemy) OR `player.timeStopUntil`
    // (TIME STOP, global), so the stacking station, the corner release and
    // 6.91.1's hunt all fire on a WHISKY SOUR freeze with no further work.
    //
    // NO GUN RISK: LEMON sits in AVOID_INGREDIENTS_BASE and never unbans, so
    // SUPER WHISKY SOUR is unreachable and this can never become the sixth super
    // line that summons the Rainbow Gun. That is what makes it safe to carry.
    // v6.92.2 (user, on the crown run): "Also had normal moscow mule or vodka
    // cherry for knockback effect". MOSCOW MULE is the SAFE half of that pair:
    // its key GINGER BEER is arming-capped, while VODKA CRANBERRY's key
    // CRANBERRY is a PLAN_INGREDIENT the build must MAX for pickup radius —
    // taking VODKA CRANBERRY would open a latent fifth line for free.
    // game-source-facts is blunt that the 17px shove itself is dead by minute
    // 129 (0.13 frames of separation), but MOSCOW MULE and VODKA CRANBERRY are
    // primary in four of the all-time top runs including 255:48, so something
    // on that card works — lifesteal riding the kick, or the kbActive stun.
    // Carried as a keyless occupant on that evidence, not on the shove theory.
    const KEYLESS_BOOST = ['NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'];
    // ...and the four that DO carry a key must still outrank them, or the
    // keyless boost quietly demotes the super plan it was meant to sit beneath.
    // (Caught on first measurement: SOUTH SIDE fell to 97 against NEGRONI 136.)
    // v6.89.3 (user, from watching the runs): "these are the only essential
    // super cocktails: mojito, vodka tonic, and southside." GIN TONIC was out,
    // and the shrink was self-enforcing: TONIC stays in the ingredient plan, so
    // the 6.89.1 latent-line rule hard-refused GIN TONIC at level zero.
    //
    // v6.91.9 — THE CROWN RUN SAYS OTHERWISE, and it is the strongest build
    // evidence this project has. The user's 62686s (17.4 h) manual run — FOUR
    // TIMES the bot's best ever — was built on:
    //
    //     supers      GIN TONIC, VODKA TONIC, MOJITO, SOUTH SIDE
    //     non-supers  NEGRONI, WHISKY SOUR
    //
    // The bot was carrying five of those six and missing a SUPER LINE.
    //
    // AND IT IS THE CHEAPEST LINE ON THE BOARD. GIN TONIC and VODKA TONIC share
    // one key — both are TONIC — and TONIC is already in PLAN_INGREDIENTS for
    // VODKA TONIC. So the fourth super costs ONE COCKTAIL SLOT AND ZERO
    // INGREDIENT SLOTS. Nothing else on the roster is that cheap, and 6.89.3
    // gave it away for nothing.
    //
    // Completable lines go 3 -> 4 (MINT, TONIC x2, SUGAR). NEGRONI's CAMPARI is
    // off-plan and WHISKY SOUR's LEMON is permanently banned, so neither can
    // ever complete. Four against the six-super Rainbow Gun gate.
    const SUPER_LINE_COCKTAILS = ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'MOJITO'];

    // =================================================================
    // v6.92.0 — THE ARMING CAP. Measured, not theorised.
    //
    // A live run was read at five evolved supers, one short of the gun:
    //   evolved: [southside, vodkatonic, negroni, mojito, gimlet]
    // NEGRONI and GIMLET are both supposed to be structurally impossible.
    // `weapons` shows why, and it is not the absorbed-key subtlety of 6.89.0:
    //   campari: 6   lime: 6
    // The bot simply BOUGHT them to max. CAMPARI is on no list at all, and
    // LIME is on JUNK_ACCEPTABLE / HELL_SAFE_JUNK by user direction.
    // Its own safe-junk tier armed an off-plan super line.
    //
    // Banning them outright does not work — the late pool narrows until junk
    // is the only card on offer, which is the whole reason JUNK_ACCEPTABLE
    // exists. So refuse only the LAST level. A key at Lv5 arms nothing: the
    // junk still fills the pool and still pays its stat, and the line stays
    // shut. Occupancy closes the cocktail side; this closes the key side.
    //
    // The set is COMPUTED, never listed, so a roster edit can't leave it
    // stale. An ingredient is arming-capped when all three hold:
    //   - some cocktail keys off it (otherwise it can arm nothing), AND
    //   - it is not the key of a line we intend to complete, AND
    //   - it is not in PLAN_INGREDIENTS — because OLIVE, TOMATO JUICE,
    //     CRANBERRY, SWEET VERMOUTH, DRY VERMOUTH and WATER are all keys of
    //     off-plan cocktails too, and the plan needs every one of them MAXED
    //     for its stat. Those stay guarded by occupancy and `latent-line`.
    // Yields exactly the ingredients with no plan value: LIME, CAMPARI,
    // LEMON, ORANGE, ANGOSTURA, COINTREAU, GINGER BEER, ABSINTHE.
    const SUPER_LINE_KEYS = new Set(SUPER_LINE_COCKTAILS.map(c => SUPER_KEY_INGREDIENT[c]).filter(Boolean));
    function armsOffPlanLine(name) {
        // applyHellUnban() PUSHES its ingredients into PLAN_INGREDIENTS, which
        // would otherwise exempt them from this cap by the clause below. That
        // unban exists to open a FIFTH super line, which v6.92.1 stopped
        // wanting (maxSuperLines 4). The list is empty today; this keeps the
        // cap correct if it is ever re-armed.
        if ((CONFIG.hellUnbanIngredients || []).includes(name))
            return COCKTAILS.some(c => SUPER_KEY_INGREDIENT[c] === name);
        if (PLAN_INGREDIENTS.includes(name)) return false;
        if (SUPER_LINE_KEYS.has(name)) return false;
        return COCKTAILS.some(c => SUPER_KEY_INGREDIENT[c] === name);
    }
    // true when THIS pick is the one that would max the key and arm the line.
    function armsLineNow(type, name, lv, maxlv) {
        if (type === 'weapon' || !armsOffPlanLine(name)) return false;
        const top = (typeof maxlv === 'number' && maxlv > 0) ? maxlv : 6;
        return (lv || 0) + 1 >= top;
    }

    // v6.89.4 (user): "make kiting lower in hell mode if bot has SOUTH SIDE /
    // VODKA TONIC / MOJITO / NEGRONI / GIN TONIC and the black vermouth and
    // water and sugar and olives" — "can keep tomato juice and cranberry as
    // well."
    //
    // This is a COMPLETENESS measure, not a roster. Kiting is what a thin build
    // does because it has nothing else: drag the pack and hope. Once the burn,
    // the shield, the armour and the ult economy are all standing, the same
    // motion is pure cost — it walks the bot out of its own burn zones and
    // stops the base attack ever pointing at anything for long.
    //
    // Scored as a SHARE rather than an all-or-nothing gate, deliberately: GIN
    // TONIC is off the roster as of 6.89.3 and is hard-refused by the
    // latent-line rule, so a list that required every name would never fire.
    // A share degrades gracefully as the roster changes.
    const KITE_DAMP_BUILD = [
        'SOUTH SIDE', 'VODKA TONIC', 'MOJITO', 'NEGRONI', 'GIN TONIC',
        'BLACK VERMOUTH', 'WATER', 'SUGAR', 'OLIVE', 'TOMATO JUICE', 'CRANBERRY'
    ];
    // At a full build the kite runs at this fraction of its normal pull.
    // Lives in CONFIG.movement rather than as a module const so the strength is
    // a LIVE dial — pineBot.config.movement.kiteDampFull = 1 disables it — and
    // so a test can vary it in isolation. That second reason is not incidental:
    // two attempts to prove this change behaviourally by varying the BUILD both
    // passed with the damping deleted, because owning those items moves other
    // planner terms too. Varying the constant is the only clean isolation.

    // =================================================================
    // v6.88.4 PHASE DOCTRINE (user, stated as a strict ordering)
    // =================================================================
    // "The ordering of everything matters." Given verbatim, ingredients first
    // then cocktails. Index 0 is taken first; the bonus is large enough to
    // dominate every other term in the day, because an ORDER that competes
    // with the old weights is not an order.
    // v6.106.0 — THE SUPER KEYS MOVE TO THE FRONT OF THE INGREDIENTS.
    // Measured, not assumed. On 6.102.0, runs that reached hell and died there
    // (n=26) against runs that survived into deep (n=19):
    //     supers at entry:  65% had ZERO   vs   0% had zero
    //     mean supers:      0.42           vs   3.26
    //     defense at cap:   46%            vs   47%   <- NO separation
    //     mean defense:     28.0           vs   28.2  <- NO separation
    // Replicated on the fresh 6.104.0 rows: deaths [0,0,2,1] (50% zero),
    // survivors [3,3,3,2] (0% zero). Time-matched against early-ending
    // survivors so this is not just "survivors lived longer and picked more".
    // SUPERS are what carry a run through the entrance; armour is not.
    // TONIC is the key for TWO super lines (VODKA TONIC and GIN TONIC) and sat
    // at rank 11 — behind every vermouth and every juice. MINT (SOUTH SIDE)
    // sat at 10, SUGAR (MOJITO) at 6. The stated order was funding the wrong
    // things first. Keys first, then the crafts, then the fillers.
    // ONLY THE RANKS MOVED. The per-rank step is untouched at 11 — see the
    // v6.88.6 note in 03-scoring: raising it to 200 made the order
    // lexicographic and dropped supersPerRun 1.9 -> 1.1. The cocktail block
    // below is byte-identical and keeps indices 11..17.
    // ══ v6.119.0 THE DAY ORDER IS NOW THE USER'S PRIORITY LIST ══════════════
    //
    // USER, stated as doctrine:
    //   * "black vermouth and simple syrup and olives and negroni are essential
    //      for defense and increased HP"
    //   * "mint is essential for super cocktail for southside, the best boss
    //      killer during hell mode"
    //   * "cranberry is essential for the wide radius of pick up of items like
    //      random tequila shots, time pause, and flame cross that appear when
    //      you kill mobs"
    //   * "tomato juice is a good to have for its cutting of cooldown"
    //   * (separately) "water instead of tonic could have been a better early pick"
    //
    // TONIC is not on that list. It was rank 1.
    //
    // This is a DELIBERATE revision of the 6.106.0 ordering, and that version's
    // evidence deserves stating rather than quietly overwriting. It measured,
    // and replicated, that SUPERS separate survivors from deaths (65% of hell
    // deaths had zero supers against 0% of deep survivors; defense showed NO
    // separation) and moved the super keys to the front on that basis. TONIC
    // keys TWO lines, so it led.
    //
    // What that measurement actually licenses is "a super key first" — not
    // "TONIC first". MINT is a super key too, and three things now say it is
    // the one that matters:
    //   1. The user's own play: SOUTH SIDE is the hell boss killer.
    //   2. 6.118.0's top five runs are SOUTH SIDE, SOUTH SIDE, SOUTH SIDE,
    //      SOUTH SIDE, SOUTH SIDE — every one of them.
    //   3. supersPerRun ROSE to 0.8 (from 0.4/0.5) in the same batch that put
    //      a 240-point regen spine into hell, so funding regen has not so far
    //      cost the super lines anything measurable.
    // So MINT leads and TONIC is demoted to the back of the ingredients. The
    // two tonic lines are still reachable; they are no longer bought FIRST.
    //
    // Craft ordering is preserved and is not negotiable — a craft result can
    // never be picked before both of its halves:
    //   SIMPLE SYRUP after WATER + SUGAR;  BLACK VERMOUTH after DRY + SWEET.
    // `slot-lockout` asserts both, and asserts the new ranks as literals.
    // ══ v6.120.0 THE 6.119.0 RE-RANK IS RETRACTED ═══════════════════════════
    //
    // It measured z = -2.49 ("worse") at n=40, and the funnel says where:
    //     entrySurvival  0.40 -> 0.09      buildsReady  13 -> 0
    //     supersPerRun   0.7  -> 0.4       capOuts       8 -> 0
    // A FOUR-FOLD collapse in the share of hell entrants that survive 300 s.
    // Of eleven entrants, one lived.
    //
    // 6.106.0 predicted exactly this and I overrode it on doctrine. Its
    // measurement — replicated on two batches — is that SUPERS separate
    // survivors from deaths and defense shows no separation. I read that as
    // licensing "a super key first, and the user says which key", and moved
    // TONIC from rank 1 to rank 11, behind six other ingredients. TONIC keys
    // TWO super lines. The picks audit from a 6.119.0 run shows the result:
    // ESPRESSO MARTINI taken as the first weapon, then GIN TONIC, then MOSCOW
    // MULE — and MINT never picked at all. Promoting MINT did not buy SOUTH
    // SIDE; demoting TONIC just defunded the entrance.
    //
    // The user's doctrine is not wrong about what is GOOD. It was my ordering
    // that starved the early super lines, and the ordering was mine. Back to
    // the 6.106.0 order, and the doctrine gets re-introduced one rank at a
    // time against measurements rather than all at once.
    const DAY_ORDER = [
        'TONIC', 'MINT', 'SUGAR', 'OLIVE', 'DRY VERMOUTH', 'SWEET VERMOUTH',
        'BLACK VERMOUTH', 'WATER', 'SIMPLE SYRUP', 'TOMATO JUICE', 'CRANBERRY',
        'SOUTH SIDE', 'MOJITO', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'
    ];   // SIMPLE SYRUP still sits after BOTH its halves (WATER 4, SUGAR 3).
         // OLIVE is still the first thing after the three keys, and 6.105.0's
         // entry-armour checkpoint (+18 from 750s, +40 from 1050s) is unchanged,
         // so armour is still bought before the entrance — it is just no longer
         // bought INSTEAD of the super keys.
         // v6.91.5 (user): "whisky sour should be in the planned cocktails".
         // LAST among the cocktails on purpose — the three super lines and the
         // keyless NEGRONI keep their order, and WHISKY SOUR is the fifth slot
         // rather than a competitor for the first four. It still lands well
         // before the 1200s hell entrance, which is the point: the freeze has to
         // be in hand BEFORE the bosses that one-hit arrive.
         // v6.89.3: GIN TONIC / VODKA CRANBERRY dropped — the
         // ingredient order above is UNCHANGED, per the user: "for ingredients
         // the roster should stay with the priorities."
    // THREE ADDITIONS TO THE USER'S LIST, each flagged rather than assumed:
    //   SWEET VERMOUTH — BLACK VERMOUTH is sweetver + dryver. The list names
    //     the craft and one half; without the other half the craft is
    //     unreachable, so it sits beside DRY VERMOUTH.
    //   SIMPLE SYRUP   — same reasoning for the WATER + SUGAR craft, placed
    //     immediately after both halves.
    //   TONIC / GIN TONIC — the list has VODKA TONIC but not TONIC (its super
    //     key, shared with GIN TONIC). Two of the four super lines die without
    //     it. Placed last among ingredients and GIN TONIC beside VODKA TONIC.
    // If any of those three is wrong, they are the lines to delete.

    // "hell phase - junk pool but lime, soda water, and coffee beans and other
    // items that don't make a 6th super cocktail forcing a rainbow upgrade":
    // once hell latches the plan is BUILT, and the job changes from assembling
    // to not opening the gun gate.
    const HELL_SAFE_JUNK = ['LIME', 'SODA WATER', 'COFFEE BEANS'];
    // v6.88.5 (user): "mule out unless it's the only option that doesn't make a
    // 6th cocktail". Off the roster entirely, but not refused — with GINGER
    // BEER banned for good it can never complete a super, which makes it the
    // safest thing on a forced pool. Scored beneath every planned card and
    // beneath the hell-safe junk, above true junk (CORPSE REVIVER No.2 and
    // ABSINTHE, which cannot damage holdouts at all).
    // v6.94.2 — EMPTIED, on demo evidence (audit A1 confirmed live). The
    // clamp silently discarded every mule bonus 6.92.2/6.92.3 added: the
    // 6.94.1 pat digest shows VODKA CRANBERRY taken at gt 43 — the game's
    // mutual exclusion then closed MOSCOW MULE for the whole run, spending
    // the exclusive slot on the one latent line the arming cap cannot touch
    // (CRANBERRY is a plan ingredient). With the clamp gone the mule scores
    // its intended keyless-core + mule-lockout and claims the slot FIRST.
    const LAST_RESORT = [];
    // Measured band, not a guess. It must sit BELOW the hell-safe junk
    // (COFFEE BEANS 76, LIME 53, SODA WATER 49) so the mule is never sought,
    // and ABOVE true junk (CORPSE REVIVER No.2 20, GINGER BEER 15, ABSINTHE
    // -14) so that when the pool is nothing but junk the mule — which cannot
    // open a sixth super now that GINGER BEER is permanently banned — is what
    // gets eaten. A first attempt at 14 put it under CORPSE REVIVER, which is
    // the one card the roster notes call unable to damage holdouts at all.
    const LAST_RESORT_CEILING = 30;
    // v6.89.0 (user): "maybe we need to get old fashioned and corpse reviver
    // no.2 out of the junk pools as we know southside and timestop upgrades and
    // negroni and olive and water are key to survival".
    //
    // These are not merely weak — they are the wrong KIND of card. A cocktail
    // occupies a permanent weapon slot, and the slots are the very resource
    // the lockout doctrine spends to shut the Rainbow Gun out. Eating one as
    // "junk" is the opposite of eating an ingredient as junk: the ingredient
    // costs nothing the plan wanted, the cocktail costs a slot the plan needs.
    // Scored below the mule's ceiling so they lose to every safe junk card and
    // to the mule itself; only a pool with literally nothing else can force
    // one.
    const SLOT_WASTERS = ['OLD FASHIONED', 'CORPSE REVIVER NO.2'];
    // v6.89.0 (user): "black vermouth and tomato juice are also very important
    // like olives". Not a re-ordering — a TIER. The day order is a preference
    // among comparable cards; these three are the ones a run cannot survive
    // without, and they must outrank the slot-claim rather than merely sit at
    // the top of the same list. OLIVE is the orbit, BLACK VERMOUTH the crafted
    // summon that carries the vermouth line's whole investment, TOMATO JUICE
    // the ultimate uptime that funds the day.
    const SURVIVAL_CORE = ['OLIVE', 'BLACK VERMOUTH', 'TOMATO JUICE'];
    // v6.88.3 (user): top-priority ingredients and crafts.
    const TOP_INGREDIENTS = ['OLIVE', 'TOMATO JUICE', 'CRANBERRY', 'MINT', 'BLACK VERMOUTH', 'SIMPLE SYRUP'];
    // the halves that must reach Lv6 for those two crafts to become available
    const CRAFT_HALVES = ['SWEET VERMOUTH', 'DRY VERMOUTH', 'WATER', 'SUGAR'];   // v6.88.3: COFFEE BEANS unbanned — it is the REVIVE (reviveCharges 1 in the 373-minute run)   // LEMON stays banned (blocks SUPER WHISKY SOUR = the 6th super); TONIC is now the shared key
    // live copy: rebuilt every run, trimmed by applyHellUnban() once in hell
    let AVOID_INGREDIENTS = new Set(AVOID_INGREDIENTS_BASE);
    let hellUnbanApplied = false;
    function applyHellUnban() {
        if (hellUnbanApplied) return;
        hellUnbanApplied = true;
        for (const ing of (CONFIG.hellUnbanIngredients || [])) {
            AVOID_INGREDIENTS.delete(ing);
            if (!PLAN_INGREDIENTS.includes(ing)) PLAN_INGREDIENTS.push(ing);
        }
        log('HELL UNBAN applied:', (CONFIG.hellUnbanIngredients || []).join(', '), '→ plan ingredients now', PLAN_INGREDIENTS.join(', '));
    }

    // ROSTER EXPERIMENT CANDIDATES — alternative 6-super builds composed from
    // the recipe book's verified roles, auditioned against the prescribed
    // roadmap by a reward-credited UCB bandit (chooseRoster). Every candidate
    // reaches the six-super Rainbow threshold and keeps the OLIVE / SWEET
    // VERMOUTH survival staples in its ingredient plan.
    //   All rosters draw ONLY from the user-approved cocktail list (the
    //   avoid list above is excluded).
    //   fortress       defense/control maxed: NEGRONI dodge-shield, olive
    //                  orbit, knockback, freeze beam — outlast everything
    //   boss-hunter    directed boss killers + boss-keepers (user-verified
    //                  tags) — convert bosses/walls into loot fastest
    //   crowd-control  swarm burn + freeze: flame zones, sniper/shotgun,
    //                  gatling freeze — clear density before it clumps
    const ROSTER_FIXED = {
        'fortress': {
            cocktails: ['NEGRONI', 'DRY MARTINI', 'VODKA MARTINI', 'MOSCOW MULE', 'WHISKY SOUR', 'BLOODY MARY'],
            ingredients: ['CAMPARI', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'GINGER BEER', 'LEMON', 'TOMATO JUICE']
        },
        'boss-hunter': {
            cocktails: ['MOJITO', 'VODKA MARTINI', 'COSMOPOLITAN', 'MOSCOW MULE', 'BLOODY MARY', 'VODKA CRANBERRY'],
            ingredients: ['SUGAR', 'DRY VERMOUTH', 'ORANGE', 'GINGER BEER', 'TOMATO JUICE', 'CRANBERRY', 'OLIVE', 'SWEET VERMOUTH']
        },
        'crowd-control': {
            cocktails: ['SOUTH SIDE', 'MOJITO', 'WHISKY SOUR', 'COSMOPOLITAN', 'NEGRONI', 'DRY MARTINI'],
            ingredients: ['MINT', 'SUGAR', 'LEMON', 'ORANGE', 'CAMPARI', 'OLIVE', 'SWEET VERMOUTH']
        }
    };
    let activeRoster = null;   // roster id this run plays ('user' | 'auto' | a ROSTER_FIXED key)

    // Static seeds — re-derived from the recipe book's REAL effects; used
    // only until measured data (3+ runs) takes over via ingredientPriority().
    //   COFFEE BEANS 26: duration + ONE REVIVE — an extra life
    //   DRY VERMOUTH 21: crit chance/damage, x4.5 at Lv6
    //   SWEET VERMOUTH 20: +max HP AND +1 cocktail slot (roadmap needs slots)
    //   COINTREAU 20: +1 projectile on EVERY weapon
    //   ORANGE 19: bigger attacks + 1 ingredient slot
    //   ANGOSTURA 18: +XP & sales — the crown stat
    //   GINGER BEER 14: level-up RE-ROLLS (the bot spends them, see handleLevelUp)
    //   TOMATO JUICE 13: ultimate cooldown cut — more invincibility uptime
    const INGREDIENT_PRIORITY = {
        'LEMON': 20, 'LIME': 20, 'DRY VERMOUTH': 21, 'COINTREAU': 20, 'ORANGE': 19,
        'SODA WATER': 16, 'TONIC': 16, 'CAMPARI': 15, 'ANGOSTURA': 18, 'COFFEE BEANS': 14,
        'SWEET VERMOUTH': 20, 'OLIVE': 16, 'WATER': 12, 'MINT': 13, 'CRANBERRY': 11,
        'GINGER BEER': 14, 'TOMATO JUICE': 13, 'SUGAR': 12, 'ABSINTHE': 3,
        // fused results (BLACK VERMOUTH user-verified as a strong weapon)
        'SIMPLE SYRUP': 22, 'CITRUS TRIO': 26, 'SODA GUN': 26, 'BLACK VERMOUTH': 27
    };

    // WEAPON TAGS — transcribed from the game's own recipe book ("✦ BOOK ·
    // RECIPES & INDEX ✦", .rec-list), cross-checked with user experience.
    // Each cocktail's real attack pattern, categorized for enemy matchups:
    //   boss/sniper/homing/burst: seeks or bursts the toughest target
    //   aoe/swarm/aura/orbit/line/zones: clears crowds
    //   control/freeze/knockback: slows or repels (anti-contact)
    //   defense/lifesteal/summon: survivability
    // v6.107.0 — SLOW IS NOT FREEZE (user, correcting this table directly):
    // "gin and vodka tonic slow the bosses, not exactly freeze."
    // The degree matters and the bot had no word for it. A full FREEZE stops a
    // boss outright — a stopped boss deals no contact damage, which is why
    // WHISKY SOUR is scored as a defensive pick (`freeze-scarce`, 03-scoring).
    // A SLOW only reduces speed; it buys kiting room, not immunity.
    //
    // `control` stays the UMBRELLA and every slow/freeze card still carries it,
    // so every rule already reading 'control' keeps its exact behaviour. The
    // new 'slow' tag and the existing 'freeze' tag are the DEGREE underneath.
    // VODKA TONIC also gains 'control', which it always should have had.
    //
    // ONLY the three cards the user named are re-tagged. COSMOPOLITAN,
    // WHISKEY HIGHBALL, VODKA CRANBERRY and DRY MARTINI have comments that
    // say "freezing"/"slowing" too, but none is user-verified and none is on
    // the roster — they keep bare 'control' until someone actually checks.
    // v6.107.0 — the armour ingredients, held back before armorTierFromS so
    // the user's phase 1 (damage) precedes phase 2 (armour). NOT the super
    // keys: SUGAR is MOJITO's key and TONIC opens two lines, so although the
    // user listed SUGAR under armour, holding it back would starve the very
    // supers 6.106.0 promoted. Only the pure-defence ingredients are held.
    const ARMOR_TIER = new Set(['OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'BLACK VERMOUTH']);

    const WEAPON_TAGS = {
        'GIMLET': ['chain', 'tanky'],                       // lightning chains, slow, hard-hitting
        'MANHATTAN': ['boss', 'burst', 'aoe'],              // cherry-bombs the TOUGHEST enemy, huge blast
        'OLD FASHIONED': ['aoe'],                           // giant ice rock, wide blast
        'SIDECAR': ['pierce', 'swarm'],                     // wall ricochet, piercing & bursting
        'MOJITO': ['boss', 'sniper', 'swarm'],              // sniper at toughest + shotgun pellets
        'COSMOPOLITAN': ['boss', 'sustained', 'control'],   // gatling freezing darts
        'GIN TONIC': ['aura', 'swarm', 'control', 'slow'],  // SLOWING/poison aura, 2x damage
        'WHISKEY HIGHBALL': ['sustained', 'control'],       // gatling fizzy freeze blasts
        'VODKA TONIC': ['homing', 'boss', 'control', 'slow'], // roaming ice familiars hunt on their own AND slow what they hit
        'VODKA CRANBERRY': ['control', 'lifesteal'],        // freezing lifesteal whip
        'SOUTH SIDE': ['aoe', 'swarm', 'zones'],            // flame rain leaves burning zones
        'MARGARITA': ['line', 'swarm'],                     // boomerangs hit out AND back
        'DRY MARTINI': ['orbit', 'control', 'defense'],     // slowing olive orbit
        'VODKA MARTINI': ['sustained', 'control', 'boss'],  // gatling olives + shockwave
        'MOSCOW MULE': ['knockback', 'control', 'lifesteal'], // kick knocks enemies away + lifesteal
        'WHISKY SOUR': ['freeze', 'line', 'control'],       // beam fully freezes a line
        'NEGRONI': ['defense'],                             // dodge chance + HP shield
        'BLOODY MARY': ['orbit', 'boss'],                   // figure-8 glass, chili peppers
        'ESPRESSO MARTINI': ['burst', 'tanky'],             // sky lightning hits hard but lands RANDOMLY — no boss duty (user-verified)
        'CORPSE REVIVER NO.2': ['summon', 'defense'],       // tanky self-healing zombie allies
        'SIMPLE SYRUP': ['aoe'], 'CITRUS TRIO': ['orbit', 'swarm'],
        'SODA GUN': ['sustained'], 'BLACK VERMOUTH': ['summon']
    };

    // Ingredient roles — also from the book: OLIVE = armor x2; SWEET VERMOUTH
    // = +max HP AND +1 cocktail slot; COFFEE BEANS = duration + ONE REVIVE.
    const SURVIVAL_INGREDIENTS = ['OLIVE', 'SWEET VERMOUTH'];   // COFFEE BEANS handled separately: revive = late-stage timing pick
    const VERSATILE_INGREDIENTS = ['MINT'];          // move speed + dash cooldown
    const ITEM_FINDER_INGREDIENTS = ['SUGAR'];       // +item drop rate (LUCK)

    // INGREDIENT PURPOSE TAGS — every passive's book-verified role, deployed
    // by context exactly like the weapon tags.
    const INGREDIENT_TAGS = {
        'LEMON': ['dps'], 'LIME': ['dps'], 'COINTREAU': ['dps'], 'SODA WATER': ['dps'], 'DRY VERMOUTH': ['dps'],
        'ORANGE': ['dps', 'slot'], 'TONIC': ['dps', 'pierce'], 'CAMPARI': ['shred'],
        'OLIVE': ['survival'], 'SWEET VERMOUTH': ['survival', 'slot'], 'WATER': ['regen'],
        'MINT': ['mobility'], 'COFFEE BEANS': ['revive'], 'TOMATO JUICE': ['ult'],
        'SUGAR': ['economy', 'luck'], 'ANGOSTURA': ['economy'], 'CRANBERRY': ['economy', 'magnet'],   // user-verified: expands loot pickup radius
        'GINGER BEER': ['meta'], 'ABSINTHE': ['summon']
    };

    // Enemy handling. Unknown types fall through to the default.
    // Source-verified pair-freeze constants (the FOUR-HOUR TWO-TOP).
    const GZ_PAIR_DIST = 54, GZ_FREEZE_R = 98;

    const ENEMY_PROFILE = {
        // USER DOCTRINE: common mobs are the LEAST of the worries — they are
        // XP on legs, and a stray contact tick costs little (38-frame invuln
        // + armor). Fear is reserved for bosses, bombers, and ranged fire.
        drunk: { weight: 0.7, radius: 38 },
        runner: { weight: 1.2, radius: 52 },
        bomber: { weight: 2.6, radius: 86 },
        thrower: { weight: 0.9, radius: 36 },
        genz: { weight: 1.4, radius: 52 },
        boss: { weight: 2.8, radius: 96 },
        // NOTE: 'passout' is deliberately absent — passed-out customers are
        // NOT threats. They are stationary loot sources (gold + XP) and are
        // handled as FARM TARGETS in gatherThreats/planMove instead.
        _default: { weight: 1.0, radius: 46 }
    };

    // Pickup value. `health` scales up as the player gets hurt.
    const PICKUP_VALUE = {
        ingredient: 34, bottle: 30, tip: 26, timestop: 24, firecross: 22, magnet: 22,
        tequila: 22,   // v6.93.1 (audit A8): was missing -> classified filler and halved near passouts, the opposite of the hell doctrine
        xp: 26, gem: 26, exp: 26, star: 20,   // XP-style drops: levels are the build engine
        // gold funds weapon upgrades (user-verified: vital) — never trash-tier
        bill: 22, coin: 14, health: 14, _default: 16
    };

    // =================================================================
    // TUNABLE PARAMETERS (auto-tuned across runs)
    // =================================================================
    // v6.93.0 — BOUNDS NARROWED. This REVERSES the "widened at gen 73"
    // decision below, which was made on the reading that "the learner wanted
    // more caution than the box allowed".
    //
    // MEASURED at gen 36 of the current store, six of these dimensions were
    // pinned or within 3% of their maxima, all in the same direction:
    //   standoffPull 2.50 / 2.5  PINNED      enemyRange   318.8 / 320  PINNED
    //   lookaheadMs   416 / 420  PINNED      panicHp       0.73 / 0.75  97%
    //   projLookahead 1066/1100  97%         enemyWeight   3.31 / 3.5   94%
    //   standoff    238.3 / 260  92%         projWeight    7.69 / 9.0   85%
    // Against defaults that is enemyWeight +120%, standoffPull +92%,
    // projLookahead +64%, standoff +59%, enemyRange +59%, panicHp +33% —
    // twelve sigma out on enemyWeight alone, with sigma collapsed to 0.15 so
    // the optimiser can no longer explore back.
    //
    // The result measured in 6.92.3 (n=20): median 601 s, hellRate 0.05,
    // meanDowns 3958 against 6.91.6's 11421, and 9 of 20 deaths to `line`.
    // A bot that stands 238 px off and panics at 73% HP kills a third as
    // much, never funds a build, and backs into hazards it is out-weighting.
    //
    // AND THE HILL IS NOT REAL. game-source-facts measures mobs at 20-33x the
    // player's speed by minute 111; the crossover is at minute 11-16, before
    // hell even starts. Evasion cannot buy separation in the phase that pays.
    // The CEM has spent dozens of generations climbing a lever the game's own
    // physics says does not exist, and every previous pin was answered by
    // WIDENING the box and letting it climb further.
    //
    // So the maxima come back toward the defaults. The learner keeps room to
    // explore; it no longer has room to run away. loadLearn() clamps a stored
    // mean into the current box (v6.93.0), so this bites on the live store
    // rather than only on a fresh one.
    // v6.111.0 — the boxes as they stood in 6.110.0, for EVERY dimension this
    // build widens. The box-change re-open in loadLearn compares each dim's
    // current box against the one it was last trained under, but a store
    // written before 6.111.0 has no such record: seeding those from the
    // CURRENT boxes would make the very upgrade that widened them look like
    // no change at all, and the three pinned dimensions would stay pinned
    // with sigma at the floor — the config diff would ship and nothing would
    // move. This table is the missing memory, and it is needed exactly once.
    //
    // MAINTENANCE — v6.116.0 CORRECTS THE INSTRUCTION 6.111.0 WROTE HERE.
    // That comment said to empty this table on the next bump, because an entry
    // left behind "re-opens that dimension on every single load". Checked
    // against the code rather than repeated: the seed is guarded by
    // `d.cem.box[k] == null`, and every load rewrites `d.cem.box[k]` from the
    // live spec before it returns. So the table is consulted exactly once per
    // store, on the first load that has no box record, and `box-reopen` test
    // (2) already proves the second load is silent. It is self-limiting.
    //
    // Emptying it would therefore buy nothing and cost the migration for any
    // store still on a pre-6.111.0 shape — including the one `box-reopen`
    // builds. What DOES need policing is a future version narrowing one of
    // these boxes back, which would leave a prior identical to the live box
    // and re-open nothing while claiming to; `store-guard` asserts every key
    // still names a box that actually differs, and goes red if one does not.
    const TUNABLE_PRIOR = {
        'threat.lineWeight': { min: 2.0, max: 9.0 },
        'movement.hellCautionMul': { min: 0.8, max: 2.2 },
        'movement.bossEngageValue': { min: 10, max: 36 }
    };
    const TUNABLE = {
        'movement.smoothing': { min: 0.2, max: 0.85 },
        'movement.standoff': { min: 55, max: 190 },
        'movement.standoffPull': { min: 0.0, max: 1.8 },
        'movement.lootPull': { min: 0.3, max: 2.0 },
        'movement.panicHp': { min: 0.2, max: 0.62 },
        'movement.lookaheadMs': { min: 140, max: 380 },
        'threat.enemyWeight': { min: 0.5, max: 2.2 },
        'threat.enemyRange': { min: 110, max: 240 },
        'threat.projWeight': { min: 1.0, max: 6.5 },
        'threat.projLookaheadMs': { min: 300, max: 850 },
        'threat.markWeight': { min: 5.0, max: 20.0 },   // measured mark damage ~93: two landings can end a run
        // v6.111.0 THE LANE SCALAR WAS DOING TWO JOBS AND CEM PRICED THE SUM.
        //
        // At n=1250 `threat.lineWeight` sat at 2.107 — its box MINIMUM, flagged
        // `converged` — while `line` accounted for 268 of 1247 deaths (21%).
        // The search had decided the joint #1 killer was not worth avoiding.
        //
        // It was not wrong. ONE weight multiplied both halves of
        //     lineCost(...) * lineWeight * hellMul * (armed ? 14 : 7)
        // and the two halves have opposite economics:
        //   ARMED  — a live charge, lethal within 63 px of the ray. Rare,
        //     short-lived, and dodging one costs a step.
        //   UNARMED — the telegraph. Numerous, long-lived (210-frame life,
        //     arms only for the last 90), and each one paints a 126 px-wide
        //     stripe across the arena. Pricing these high makes most of the
        //     floor look impassable: the bot gets pinned, `lineOnCorner`
        //     vetoes the seat, and it eats contact damage instead.
        // The telegraph term is common and expensive; the armed term is rare
        // and cheap. Minimising the SUM means minimising the telegraph, and
        // the armed half rides down with it. CEM found the right value for
        // the wrong object.
        //
        // Split, so each half can be priced on its own evidence. The floor
        // goes to 0 on purpose: "ignore telegraphs entirely" is a legitimate
        // policy that the old box could not express, and it is very close to
        // what the search has been asking for.
        'threat.lineWeight': { min: 0.0, max: 9.0 },        // TELEGRAPH (unarmed) lanes only
        'threat.lineArmedWeight': { min: 3.0, max: 18.0 },  // live charges — its own box, its own gradient
        // strategy weights — the win strategy itself evolves across runs
        // v6.86.0: ceiling 6 -> 4. The mean sat at 5.63 (0.89 of the old box):
        // "no new cocktail while an owned one is below level 6" poured every
        // pick into the first cocktail offered and starved the super recipes
        // — 90% of the measured runs finished with ZERO supers and 14
        // distinct primaries in 30 runs. The box can no longer hold a
        // build-starving value.
        'strategy.deepFocusLv': { min: 2, max: 4 },
        'strategy.roadmapBonus': { min: 10, max: 24 },   // floored: the prescribed roster stays dominant
        'strategy.earlyDps': { min: 4, max: 24 },
        'strategy.expandPenalty': { min: 8, max: 30 },
        // v6.114.0 — how hard a regen card bids while the HP economy is under
        // break-even. The live income audit says the day is net NEGATIVE from
        // minute zero (bucket 0: loss 1.27/s vs gain 1.00/s), and one SIMPLE
        // SYRUP level (+0.512 HP/s) flips it. But every pick spent here is a
        // pick not spent on the super line, and supersPerRun 0.5 against a
        // supersMin of 3 is the other binding constraint. The trade-off is real
        // and I do not know where it sits, so the search settles it. The box
        // CONTAINS 0, so "regen is not worth a pick" stays expressible.
        'strategy.regenDeficit': { min: 0, max: 220 },
        'strategy.dpsDeficitGain': { min: 10, max: 40 },
        // v6.86.9: `strategy.rainbowReadyS` REMOVED from the search. With the
        // gun banned the window it describes can never be reached, and it had
        // been sitting pinned at its box maximum for hundreds of generations
        // — a dead dimension the CEM was still spending samples on.
        'movement.kitePull': { min: 0.5, max: 4.0 },
        'movement.escapePull': { min: 1.5, max: 6.0 },
        // v6.111.0: was max 2.2, where the mean sat (2.200, `atEdge:"max"`,
        // `converged`). A mean welded to a bound means the BOX is wrong, not
        // the value — the search wants more hell caution than it is allowed
        // to ask for, and has wanted it long enough for sigma to anneal.
        'movement.hellCautionMul': { min: 0.8, max: 3.2 },
        'movement.passoutValue': { min: 18, max: 54 },   // floored+widened: every passout must die before the finale (user)
        'movement.wallSiegeValue': { min: 12, max: 42 },
        // v6.111.0: mean 10.75 against a floor of 10 — effectively pinned.
        // "Never engage a boss" is the policy the search keeps reaching for
        // and the box keeps refusing to let it state.
        'movement.bossEngageValue': { min: 0, max: 36 },
        // v6.107.0 — FOUR NEW DIMENSIONS. The comment below warns that adding
        // one to a live learner requires seeding mean=default and
        // sigma=(max-min)/4 first. That seeding is now UNCONDITIONAL: the
        // loader at 02-learning.js:209-227 fills any TUNABLE key missing from
        // a stored CEM with DEFAULT_PARAMS[k] and a full sigmaInit, per key,
        // on every load — hardening that postdates the 6.85.22 accident this
        // warning was written about. `store-guard` asserts it.
        // All four boxes CONTAIN their default, so a store that has never
        // seen them starts centred rather than being dragged somewhere new.
        'movement.bossRingMul': { min: 0.8, max: 1.25 },
        'movement.poRingMul': { min: 0.8, max: 1.3 },
        // MEASURED BOX, not a guessed one. The anchor has to outbid the danger
        // of the very bodies it points at, so its useful scale is larger than
        // the other *Value weights. Swept on a 4-body pack 125px out: 34 moved
        // the chosen direction by ONE candidate slot (dx -0.98 -> -0.83) and
        // the bot still fled; the hold appears between 34 and 80 (dx +0.98 at
        // 80). A 34 ceiling would have made this term permanently decorative —
        // the same mistake as the 6.91.4 flat +12 freeze bonus, which could
        // not move a pick either. The DEFAULT stays low so v6.107.0 behaves
        // close to 6.106.0 out of the box and the search walks into the rest.
        'movement.anchorValue': { min: 0, max: 120 },   // opens at ZERO: the search may refuse the idea
        'movement.anchorTtkS': { min: 2, max: 10 }
        // v6.85.23: the six 6.85.22 dims are WITHDRAWN from the search.
        // They never actually sampled (the stored CEM state had no mean or
        // sigma for them, so every draw was NaN and applyParams skipped it)
        // but the NaN entries poisoned the batch/hof/step-size state across
        // 27 refits. The knobs stay in CONFIG (settable, testable); adding a
        // dimension to a LIVE learner requires seeding mean=default and
        // sigma=(max-min)/4 first — do that, one dimension at a time, only
        // on a version whose baseline is already measured.
    };

    function getParam(path) {
        return path.split('.').reduce((o, k) => (o == null ? o : o[k]), CONFIG);
    }
    function setParam(path, v) {
        const parts = path.split('.');
        let o = CONFIG;
        for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
        o[parts[parts.length - 1]] = v;
    }
    const DEFAULT_PARAMS = {};
    for (const k of Object.keys(TUNABLE)) DEFAULT_PARAMS[k] = getParam(k);

    function applyParams(p) {
        if (!p) return;
        // v6.85.23 HARDENED: isFinite(null) is TRUE (null coerces to 0), and
        // JSON round-trips NaN as null — so a poisoned store could apply
        // null params (patRing.early null -> a 20px suicide station;
        // killOrderDist null -> x0 = the frailest-first regression). Only a
        // genuine finite number is ever applied.
        // v6.88.0 AUDIT D5: and only ever INSIDE the live TUNABLE box. Champion
        // replays did `{...learn.hof[0].p}` with no clamp, so vectors stored
        // under an older, wider box survived every narrowing. 6.86.0 tightened
        // strategy.deepFocusLv from 6 to 4 precisely because a mean of 5.63 was
        // build-starving — yet every 4th run replayed 5.63, and refitCem then
        // pulled the mean back toward it. applyParams is the one choke point
        // every path goes through, so the clamp belongs here.
        for (const k of Object.keys(TUNABLE)) {
            const v = p[k];
            if (typeof v !== 'number' || !isFinite(v)) continue;
            const box = TUNABLE[k];
            setParam(k, Math.max(box.min, Math.min(box.max, v)));
        }
    }
    // VERSION TAG: the rollup key. The scoring profile is part of the tag,
    // so "6.80.0 playing the crown rules" and "6.80.0 playing the 6.79 rules"
    // are two separate rows in the comparison — never averaged together.
    const scriptTag = () => SCRIPT_VERSION + (CONFIG.scoringProfile === 'crown-6.74' ? '+crown' : '') +
        (activeChar ? '+' + activeChar : '');
    // v6.85.0: learned state lives in a PER-BARTENDER store; the version
    // comparison (versions + snapshots) lives in ONE shared store. minguk
    // keeps the legacy key so his ~600 runs of tuning carry over untouched.
    // =================================================================
    // v6.124.0 THE STORE NAMESPACE — two bots, one localStorage
    // =================================================================
    // The 6.123.0 n=82/83 reports carried 234 of 240 funnel rows tagged
    // 6.135.0-6.139.0: versions this tree never built, at medianSpeed 2.76
    // against our 15.5, casts 3-4 against 13-21, dayClearRate 0 across all
    // of them. The user's answer: "I have another model running made by
    // codex." A fork of this script, on the same origin, in the same
    // browser profile, writing the same localStorage keys. Every rolling
    // window (funnel, parkAudit, markAudit, incomeAudit, damageAudit) was
    // therefore unreadable for our own version, and nothing guaranteed the
    // CEM vector was ours either.
    //
    // localStorage is per ORIGIN per BROWSER PROFILE, so the cleanest
    // separation is a second profile — zero code. This is the code-side
    // belt to that suspender: an opt-in suffix on every key the bot owns.
    //   pineBot.namespace('claude')   -> sets it, migrates, reloads
    //   pineBot.namespace()           -> reads it
    // The suffix is stored under an UN-suffixed meta key (it has to be
    // readable before we know the namespace) and lives in the profile, so
    // a rebuilt script keeps the choice. Migration is COPY, never move:
    // the first boot under a new namespace copies each owned key that has
    // no namespaced twin yet, so the ~9500-run learn blob carries over
    // untouched and the Codex fork keeps writing to the bare keys we no
    // longer read. The game's own keys (paco_bdh_time) and the human demo
    // recordings (pineBotDemos) are deliberately NOT namespaced — both are
    // ground truth that either bot may read.
    // Only keys of the exact shapes this file writes are migrated:
    // `<base>`, `<base>_<char>`, `<base>_<char>__bak`, `<base>_shared`.
    // Another namespace's copies (`<base>_joe.codex`) are never touched.
    const STORE_NS_META = 'pineBotNamespace';
    const STORE_NS = (() => {
        try {
            const v = String(localStorage.getItem(STORE_NS_META) || '').replace(/[^\w-]/g, '');
            return v ? '.' + v : '';
        } catch (e) { return ''; }
    })();
    const nsKey = k => k + STORE_NS;
    const STORE_BASES = [CONFIG.learning.storageKey, 'pineBotDmgAudit', 'pineBotIncAudit',
        'pineBotHuntAudit', 'pineBotPauseAudit', 'pineBotParkAudit', 'pineBotPhaseAudit',
        'pineBotBossCensus_v1', 'pineBotMarkAudit', 'pineBotCraftAudit_v1'];
    function migrateStoreNamespace() {
        if (!STORE_NS) return 0;
        let copied = 0;
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
            for (const k of keys) {
                if (typeof k !== 'string') continue;
                const base = STORE_BASES.find(b => k === b || k.startsWith(b + '_'));
                if (!base) continue;
                const rest = k.slice(base.length);
                if (!/^(_[a-z]+(__bak)?|_shared)?$/.test(rest)) continue;   // another namespace, or .broken
                const target = k + STORE_NS;
                if (localStorage.getItem(target) != null) continue;
                const v = localStorage.getItem(k);
                if (v == null) continue;
                localStorage.setItem(target, v);
                copied++;
            }
            if (copied) console.log('[PineBot] namespace ' + STORE_NS.slice(1) + ': copied ' + copied + ' key(s) from the bare store');
        } catch (e) { }
        return copied;
    }
    migrateStoreNamespace();
    // learnKey('__bak') / learnKey('.broken'): the suffix goes INSIDE the
    // namespace so `_joe__bak.claude` migrates and reads as one family.
    const learnKey = (sfx) => nsKey(CONFIG.learning.storageKey +
        (activeChar && activeChar !== 'minguk' ? '_' + activeChar : '') + (sfx || ''));
    const SHARED_KEY = nsKey(CONFIG.learning.storageKey + '_shared');

    // =================================================================
    // BOT STATE
    // =================================================================
    let running = false;
    let rafId = null;
    let lastTick = 0, lastOverlay = 0;
    // v6.100.0 SPEED INVARIANCE: at a frame multiplier (the pine-speed
    // userscript runs the game at up to 100 virtual frames per real frame)
    // every wall-clock gate runs slow relative to the GAME — the 6.99.3/4
    // rows measured the wreckage: the planner re-planned once per ~3.3
    // game-seconds and the death pile moved to 47-115 s. Combat cadence is
    // therefore gated on GAME time; the wall clock stays only as the
    // keep-alive for menus and pauses, where gameTime is frozen.
    let lastTickGt = 0;
    const heldKeys = new Set();
    let smoothVec = { x: 0, y: 0 };   // un-normalised, so a reversal can pass through zero
    let lastDir = { x: 0, y: 0 };     // unit heading actually being driven
    let lastDash = 0, lastUlt = 0;

    const TAB_ID = Math.random().toString(36).slice(2, 6);          // identifies this tab in a parallel farm
    let learn = loadLearn();
    // v6.86.2 passout feasibility tracking (per run; see planMove)
    let poTrack = { id: null, hp: 0, at: 0, inRangeS: 0, dps: 0 };
    let poGiveUp = new Set();
    function poReconsider() { poGiveUp = new Set(); }
    function resetPoTracking() { poTrack = { id: null, hp: 0, at: 0, inRangeS: 0, dps: 0 }; poGiveUp = new Set(); }
    let trialParams = null;                                         // CEM sample being trialed this run
    let championRun = false;                                        // this run replays the all-time-best params
    let pendingHellEntry = false;                                   // we clicked the hell entrance — next run is hell
    let dangerAccum = { contact: 0, proj: 0, mark: 0, line: 0, rival: 0 };    // death-cause telemetry
    // v6.85.22: HP lost near each enemy TYPE this run. Feeds the learned
    // per-type threat multiplier at run end — measured fear, not static fear.
    // v6.107.0: SOLE-CANDIDATE ONLY. Written in 05-movement exclusively for
    // damage events where contact was the one hazard class in range, and
    // attributed to the body inside contact reach. `hitTypeN` counts those
    // events so the application site can refuse a type it has barely seen —
    // an EMA alone cannot tell one sample from fifty.
    let hitTypeRun = {}, hitTypeN = {};
    // v6.85.13 DAMAGE AUDIT — an INSTRUMENT, not a change of behaviour.
    // `dangerAccum`'s own classifier is left byte-identical so death verdicts
    // stay comparable with the 145-run 6.85.12 sample. This records the
    // EVIDENCE at each damage event instead of a single verdict, because the
    // classifier has two blind spots that its output cannot reveal:
    //   * it is an if/else chain DEFAULTING to 'contact', so every hit with no
    //     recognised hazard in range has been silently counted as contact;
    //   * 'mark' sits last, after 'proj', so a hit with both in range scores
    //     proj and the mark is never seen.
    // `sole` counts only events where exactly ONE hazard class was in range —
    // that is the ground truth. `none` counts hits with NO candidate at all; a
    // large `none` share means the hazard model is missing a damage source
    // outright, which is what the hell bossD analysis (hit distance median 264)
    // already hinted at. Survives across runs within a page session; a compact
    // summary is persisted so a reload does not lose it.
    // Field-wide nearest-boss distance, tracked BEFORE the enemyRange cut.
    // The audit needs it: the hell hypothesis is that damage arrives from
    // bosses at ~264px median, which the 200px threat gather cannot see, so
    // reading bossD off `th.enemies` would be blind exactly where it counts.
    const nearestBossRef = { v: Infinity };
    const poFreeRef = { v: 0 };   // free passouts in the local window, set by gatherThreats
    const DMG_AUDIT_KEY = nsKey('pineBotDmgAudit');
    let dmgAudit = (() => {
        const blank = { n: 0, hp: 0, cls: {}, sole: {}, none: { n: 0, hp: 0, bossD: [], near: [] }, ev: [], runs: 0 };
        try {
            const raw = JSON.parse(localStorage.getItem(DMG_AUDIT_KEY) || 'null');
            if (raw && typeof raw.n === 'number') return Object.assign(blank, raw);
        } catch (e) { }
        return blank;
    })();
    // v6.89.7 THE INCOME AUDIT — the measurement no version has ever taken.
    //
    // Source facts change what "survival" means at depth. Invuln is 33 frames
    // and contact damage is a flat ~22.4, so contact income is RATE-LIMITED at
    // roughly 40 dps no matter how many bodies are on us. Past the speed
    // crossover (minguk ~14 min, before hell even starts) positioning cannot
    // move that number much: mobs run 9x our speed by 60 min and 46x by 129.
    //
    // If that is right, deep survival is not a movement problem at all — it is
    // an ARITHMETIC one. Pool gained per second versus pool lost per second.
    // Clear the floor and the corner is indefinitely holdable; fall short and
    // the run dies on a timer no posture can change. Nothing in this bot has
    // ever measured which side of that line a run is on.
    //
    // Bucketed by 10-minute slice of gameTime so the balance can be read AS A
    // FUNCTION OF DEPTH, which is the whole point — a build that clears the
    // floor at 40 min and falls under it at 90 is the expected shape, and the
    // crossing time is the number worth optimising against.
    const INC_AUDIT_KEY = nsKey('pineBotIncAudit');
    const INC_BUCKET_S = 600;
    let incAudit = (() => {
        const blank = { buckets: {}, runs: 0 };
        try {
            const raw = JSON.parse(localStorage.getItem(INC_AUDIT_KEY) || 'null');
            if (raw && raw.buckets) return Object.assign(blank, raw);
        } catch (e) { }
        return blank;
    })();
    // Live cursors — deliberately NOT persisted: they describe the current run.
    const incCursor = { t: null, hp: null };
    // v6.89.11: the previous tick's drop-marks, positions only. A mark removes
    // itself on detonation, so by the time the HP loss is sampled it is gone and
    // the classifier blames contact by default. See the audit block in
    // 05-movement.js.
    let lastMarkSnap = [];
    // v6.91.0 dormant-boss hunt budget (gameTime seconds; reset per run)
    let huntStartS = null;
    let huntRestUntilS = 0;
    // v6.91.4: one park-suspension window per frozen-boss episode (see 05-movement)
    let parkYieldId = null;
    let parkYieldAt = 0;
    let parkYieldSpentS = 0;   // v6.117.0: total seconds yielded this run
    // v6.93.1 harvest-approach clock (gameTime seconds; reset per run) — the
    // walk TO the passout pile is time-boxed exactly like the hunt, so an
    // unreachable pile cannot deadlock the planner.
    let harvStartS = null;
    let harvRestUntilS = 0;
    // v6.94.0 day-trek clock (gameTime seconds; reset per run)
    let trekStartS = null;
    let trekRestUntilS = 0;
    // v6.91.1 THE HUNT MEASURES ITSELF. The live probe returned a boss with
    // 6,026,060,983 hp at 46 minutes. Whether our weapons move that number at
    // all is unknown, and this project's recurring cost is acting on models that
    // were never checked. Every attempt books the target's hp on arrival and on
    // departure; `pineBot.huntAudit()` reads it back. If `dmg` stays at zero,
    // the hunt is a walk to the edge that accomplishes nothing and should be
    // replaced by a warning posture rather than tuned.
    const HUNT_AUDIT_KEY = nsKey('pineBotHuntAudit');
    let huntMark = null;   // live, per-attempt; never persisted
    let huntAudit = (() => {
        const blank = { attempts: 0, frozenAttempts: 0, dmg: 0, best: 0, vanished: 0, secs: 0, runs: 0 };
        try {
            const raw = JSON.parse(localStorage.getItem(HUNT_AUDIT_KEY) || 'null');
            if (raw && typeof raw.attempts === 'number') return Object.assign(blank, raw);
        } catch (e) { }
        return blank;
    })();
    // v6.91.3 THE MARK AUDIT. The corner doctrine rests on one number —
    // "80.92 px from the nearest spawnable mark centre against a 70 px reach" —
    // and neither half has ever been measured live. The spawn box came from
    // source; the 70 px reach did not. If `dropMark.r` grows with depth then no
    // seat is immune at depth and the corner is the wrong answer to marks.
    //
    // Records every mark the FIRST tick it appears (marks persist for many
    // ticks; counting each tick would just weight long telegraphs), bucketed by
    // depth, with the quantity that actually decides the doctrine: the margin
    // between the seat and the mark's edge. A negative `worstMargin` means a
    // mark covered the seat.
    // v6.91.4 IS THE FIELD EVER ACTUALLY STOPPED? (user: "whisky sour seems
    // crucial when time pause is not available and late level bosses can one hit
    // the bot at early to mid hell".)
    //
    // Every freeze mechanism in this bot — the stacking station, the corner
    // release, 6.91.1's hunt — keys on `frozen`, which is
    // `e.frozenUntil > frame` (WHISKY SOUR, per enemy) OR
    // `player.timeStopUntil > frame` (TIME STOP, global). The second is not
    // something the build owns: it arrives as a pickup. WHISKY SOUR is the only
    // freeze the bot can BRING. If the field is rarely stopped, the whole freeze
    // half of the doctrine is dead weight unless WHISKY SOUR is in the build.
    //
    // That premise is measured rather than assumed: pause uptime across hell,
    // per run and pooled. If `share` comes back high, TIME STOP is plentiful and
    // the scoring tilt below is wrong.
    const PAUSE_AUDIT_KEY = nsKey('pineBotPauseAudit');
    let runHellTicks = 0, runPauseTicks = 0;
    let pauseAudit = (() => {
        const blank = { runs: 0, hellTicks: 0, pauseTicks: 0 };
        try {
            const raw = JSON.parse(localStorage.getItem(PAUSE_AUDIT_KEY) || 'null');
            if (raw && typeof raw.hellTicks === 'number') return Object.assign(blank, raw);
        } catch (e) { }
        return blank;
    })();
    // Fraction of THIS run's hell ticks with the field stopped. null until there
    // is enough of a sample to mean anything — the scorer treats null as
    // "scarce", because the window it fires in (hell entry) is precisely where
    // no evidence has accumulated yet and where the user says the pick matters.
    function pauseShareRun() {
        return runHellTicks >= 300 ? runPauseTicks / runHellTicks : null;
    }

    // v6.91.8 WHY DO 90% OF RUNS NEVER REACH THE SEAT?
    //
    // 6.91.6 at n=67 made the distribution BIMODAL: p60 and p120 are the same
    // number (8/67), and the last 30 runs contain NOTHING between 26 minutes and
    // 124 minutes. Against 6.89.10's shape that void is p = 6.2e-4, and the
    // 3-of-3 conversion from one hour to two is p = 8.2e-4.
    //
    // So the deep game is solved and the entry is not. A run either fails to get
    // seated and dies just past the 20-minute hell entrance, or gets seated and
    // survives to 2+ hours. The single lever left is the probability of reaching
    // the seat — and nothing currently measures it.
    //
    // Prime suspect, stated so it can be refuted: `parkArmor` needs
    // defense >= 30, which is ~5.15 OLIVE-equivalents. A run whose armour has
    // not got there by 1200s cannot park at hell entry no matter what else is
    // true. This audit records the build AT THE ENTRANCE and when park first
    // engaged, so the 10% and the 90% can be compared directly instead of
    // guessed at.
    const PARK_AUDIT_KEY = nsKey('pineBotParkAudit');
    let parkFirstS = null;      // gameTime park first engaged this run
    let parkOnTicks = 0;        // hell ticks with parkOn
    let parkedTicks = 0;        // hell ticks actually seated (vx=vy=0)
    let entrySample = null;     // the build as it crossed parkFromS
    let parkAudit = (() => {
        const blank = { runs: [] };
        try {
            const raw = JSON.parse(localStorage.getItem(PARK_AUDIT_KEY) || 'null');
            if (raw && Array.isArray(raw.runs)) return raw;
        } catch (e) { }
        return blank;
    })();
    // v6.96.2 PHASE AUDIT (user: "get the data of how it survived day mode
    // and hell and deep hell mode"). One compact row per FINISHED run: which
    // phase the run ENDED in, the entrance build, and whether the run cap
    // fired. The joe question this exists to answer: of 153 runs, WHERE does
    // the 82% day-death mass actually sit, and does a run that survives the
    // entry window ever die before deep? parkAudit answers the seat question
    // for hell runs only; this covers every run, day deaths included.
    const PHASE_AUDIT_KEY = nsKey('pineBotPhaseAudit');
    // v6.125.0: who has graduated under the immortal stop rule. Namespaced
    // with the rest, so the Codex fork on the same origin never sees it.
    const GRADUATION_KEY = nsKey('pineBotGraduation');
    let graduation = (() => {
        let g = { graduated: {} };
        try { const parsed = JSON.parse(localStorage.getItem(GRADUATION_KEY) || 'null'); if (parsed && typeof parsed === 'object') g = parsed; } catch (e) { }
        // v6.128.0 THE RESET (see CONFIG.graduation's comment for the user's
        // words). One-time, guarded so a reload never re-fires it: every
        // character's persisted count and graduated flag is wiped, and the
        // version that did the wiping is stamped as the floor
        // `immortalRowsCount` (04) reads rows against, so pre-reset rows
        // still sitting in the phase-audit window cannot re-inflate the
        // fresh counters.
        // v6.130.0 THE SECOND RESET (user: "restart the immortal build
        // process again with Joe, Minguk, and Pat by resetting the counter
        // and starting from 0 with the goal to getting to 10"). Same shape
        // as the 6.128.0 one, its own guard, and it also clears the
        // round-robin cursor so the new cycle starts at `order[0]`. A store
        // that has NEITHER flag (pre-6.128.0) gets both stamped in one go.
        // v6.132.0 THE THIRD RESET — because the DEFINITION changed, not
        // because the user asked to start over. `capStable.supersMin: 3` is
        // gone and the four-ingredient build gate replaced it, so every count
        // standing in the store was earned against a different bar and a
        // graduation mixing the two proves nothing. Same shape and its own
        // guard; a store missing any of the three flags gets all three.
        // v6.132.2 THE FOURTH RESET — for the RACE, not the counts. The counts
        // were already 0/10/0 and honest; nothing false was ever booked. What
        // needed clearing is `progress[char].runs`. Roughly 230 runs (joe 77,
        // minguk 75, pat 78) were played under 6.132.0's gate, which could not
        // fire at all: it compared a craft result's permanent level of 1
        // against a max of 6, so no build could ever satisfy the SIMPLE SYRUP
        // clause. Those runs are in the ledger, and leaving them there would
        // inflate `runsTo`, `perRun` and `hoursTo` for whoever finishes first
        // — the three figures the race exists to report. The race would have
        // measured the broken gate instead of the character. A store missing
        // ANY of the four flags gets all four.
        if (!g.resetEpoch128 || !g.resetEpoch130 || !g.resetEpoch132 || !g.resetEpoch1321) {
            g = { graduated: {}, counts: {}, resetEpoch128: 1, resetEpoch130: 1, resetEpoch132: 1,
                  resetEpoch1321: 1, immortalEpochVersion: SCRIPT_VERSION };
            // Written back immediately, not left to the next graduation/
            // bookImmortal write: a report or reload before either of those
            // fires again must see the reset, not the stale pre-reset blob.
            try { localStorage.setItem(GRADUATION_KEY, JSON.stringify(g)); } catch (e) { }
        }
        return g;
    })();
    let hellEnterGt = null;         // gameTime when hell latched (0 = run began in hell)
    let capFiredThisRun = false;    // the run-cap patrol engaged at least once
    // v6.99.3 EARLY CAP (user: "the auto-kill protocol to continue learning
    // more data if setup is complete and HP and armor and weapons and
    // ingredients are stable enough to survive corner anchoring"): once the
    // build PROVES immortality — full HP held through a whole hold window
    // with the seat armor and supers banked — the run has nothing left to
    // teach and the patrol starts early. capEarly LATCHES: the patrol
    // itself drains HP, which must not disengage it.
    let capStableSince = null, capEarly = false;
    // v6.99.4: gt when the patrol FIRST engaged this run — the phase row
    // books it as capAt, so report() can answer "when do builds actually
    // prove immortality?" and the capStable.fromS floor can be tuned from
    // measured latch times instead of guesses.
    let capFirstGt = null;
    // v6.100.1: dip-grace bookkeeping + live diagnostics for pineBot.capStatus()
    // — see the capStable.dipGraceS comment. capDipSince marks when the CURRENT
    // blip started (null = not currently dipping); capBestStreakS is the
    // longest continuous stable streak this run got to before either latching
    // or breaking (so a stuck run's report can show "45s of 300s needed, then
    // hp fell to 0.89" instead of nothing at all); capLastResetReason records
    // which leg (hp/def/supers) broke the most recent streak.
    let capDipSince = null, capBestStreakS = 0, capLastResetReason = null;
    // v6.101.0 cap ladder actuator state: gt of the last hurtPlayer poke
    // (stage 2) and whether the hard book (stage 3) has already run.
    let capHurtAt = 0, capForcedThisRun = false;
    // v6.108.0: WALL-clock stamp for the ladder's escape arm. Deliberately
    // Date.now() and not gameTime — the whole point is to see real elapsed
    // time on a page whose game clock has been starved to 0.021x.
    // =================================================================
    // v6.108.0 SPEED-INVARIANT MOVEMENT CLOCK
    // =================================================================
    // 6.100.0 moved the ABILITY gates off wall-ms for this exact reason and
    // left four in the movement loop. A live probe of a saturated run
    // measured the page at 0.021 GAME-seconds per WALL-second, and at that
    // rate every wall-ms gate runs ~48x fast against the game:
    //   cadenceHunger  (45 s)  pins at 1.0 permanently
    //   hellRecent     (90 s)  expires within TWO game-seconds
    //   rainbowRecent (150 s)  same
    //   killRate       kills per WALL second, so a starved page makes the
    //                  build look weaker than it is — and that number gates
    //                  the drop anchor's feasibility test AND feeds
    //                  dpsDeficit into card scoring.
    // So the bot plays its late game in a degenerate state that has nothing
    // to do with the game state. Every one of those four now reads GAME ms,
    // and every STAMP that feeds them is written in game ms too — changing
    // the reads alone would have compared two different clocks.
    // Falls back to wall time when gameTime is unreadable (title screens,
    // pre-boot), which is what the old behaviour was everywhere.
    function gameMs() {
        const gt = safe(() => (typeof gameTime === 'number' ? gameTime : null), null);
        return gt != null ? gt * 1000 : Date.now();
    }
    // A stamp from a previous run cannot survive into this one: gameTime
    // restarts at 0, so a stamp in the future is stale. Same guard 6.100.0
    // used for lastUlt/lastDash.
    const stampAge = st => { const n = gameMs(); return (!st || st > n) ? Infinity : n - st; };
    let capFirstWall = 0;
    // v6.108.0 SATURATION: consecutive wall-ms the field has been pinned at
    // the entity cap with HP flat. `null` = not currently saturated.
    let satSince = null, satPeakEn = 0;
    // v6.108.0 SPEED TELEMETRY. The stall that motivated this version was
    // only visible through a hand-pasted console probe; nothing in the bot
    // knew the page had collapsed to 0.021x. gameTime is frame-counted and
    // Date.now() is not, so their RATIO is the frame health, free to compute.
    // Sampled on a wall-clock cadence (a game-clock cadence cannot measure a
    // starved game clock) and carried into the phase row.
    let spdLastGt = null, spdLastWall = 0, spdSamples = [], spdWorst = null;
    // v6.109.0 THE ULT-UPTIME ECONOMY, finally measurable on live runs.
    // The manual joe demo recorded invulnShare 0.326 — a THIRD of the run
    // spent invulnerable — and concluded "the ult IS joe's armor". Its own
    // open item said: "if invulnShare in bot rows stays far below 0.326, the
    // ult-uptime economy (not the pick score) is the next lever." That
    // comparison was never possible: invulnShare is computed ONLY in the demo
    // digest (06:949) from recorded samples, so the bot had no idea what its
    // own uptime was and the lever sat unactioned for ten versions.
    // The day data says the same thing from the other side — 54% of day
    // deaths are marks and lines, which are exactly the hazards invulnerability
    // walks through — and at the entrance a MAXED ult appears in 23% of
    // survivors against 4% of deaths.
    let invulnTicks = 0, planTicks = 0, ultMaxLv = 0, ultLv6At = null;
    // v6.111.0 — the accumulator that makes the demo comparison legal.
    // `invulnTicks` counts ULT invulnerability; `invulnAllTicks` counts what
    // the demo recorder counts (isInvuln(): ult windows OR player.invuln hit
    // frames). Reporting only the first against a demo number built from the
    // second is what produced this session's retracted 3.9x. Both now ship in
    // every phase row, so the comparison can never be made wrongly again.
    let invulnAllTicks = 0;
    // casts that the game ACCEPTED (ultReadyAt moved forward), not button
    // presses — demo #5's 2174 "casts" were 2174 rejected calls, and that
    // misreading cost a whole doctrine. Paired with the observed ultCdMul,
    // this is what makes ult cadence measurable instead of inferred.
    let ultCasts = 0, ultLastReadyAt = null, ultCdMulSeen = null;
    // v6.111.0 lane-escape telemetry: ticks spent inside an armed lane band,
    // and ticks the perpendicular override actually steered.
    let laneInTicks = 0, laneEscTicks = 0, laneDivTicks = 0;
    // ── v6.112.0 THE DEEP-HELL REGIME ───────────────────────────────────────
    //
    // USER, and it is a definition rather than a threshold: "deep hell should
    // be framed as when corner anchoring works and the bot just fires
    // ultimates to keep itself alive without any movement required due to the
    // bosses being too large and stop giving tips."
    //
    // Every clause of that is already a live signal in the planner — ringHuge,
    // tipWindowToS, parkOn zeroing velocity, ultInvuln. None of them reached
    // the funnel, which booked `deep` off `phaseAudit.deepFromS` (7200 s), a
    // bare clock that knows nothing about whether the regime was ever
    // entered. A run capped at 2400 s with a perfect anchor and a run that
    // flailed to 7201 s scored deep 0 and deep 1 respectively — exactly
    // backwards.
    //
    // These accumulate the regime as a STATE the run holds, so a single run
    // yields hundreds of samples instead of one right-censored duration. That
    // is what moves the measurement out of the ~5000-runs-per-comparison class
    // and into the ~40 class.
    let deepRegimeTicks = 0, deepStreakFrom = null, deepHoldBest = 0, deepFirstGt = null,
        deepStillTicks = 0, deepInvTicks = 0, deepHpSum = 0;
    // v6.115.0: which clause ended each hold, and every hold length. The
    // 120 s threshold was a guess; these are what it should be set from, the
    // way capStable.fromS was set from medianReadyAt in 6.103.0.
    let deepBreaks = {}, deepHolds = [];
    // ── v6.116.0 WHY THE SEAT IS NOT UNDER THE BOT ──────────────────────────
    //
    // `deepBreak` answered "which clause ended the hold" and the answer was
    // { park: 27, ring: 6 } with every hold 0 or 1 game-second long. That is
    // not an anchor that fails; it is an anchor that flickers 33 times in one
    // run. But `park` is a dozen conditions ORed into one boolean — three
    // build gates, three exceptions, three higher-precedence overrides and a
    // walk — and knowing the sum is false says nothing about which to fix.
    //
    // So the same move again, one level down: every hell tick the bot is not
    // seated, book WHICH condition took it, in the planner's own precedence
    // order. This is a census of the gap between "hell" and "anchored", which
    // is precisely the consistency the user asked for.
    let parkMiss = {};
    // ── v6.112.0 THE BOSS CENSUS ────────────────────────────────────────────
    //
    // USER: "given the predictability of the bosses appearance and the size at
    // which they appear, the bot can be calibrated better" / "the boss
    // appearance and size should be in the source code of the game."
    //
    // Almost certainly true — but this project's standing rule is that the
    // truth is what is OBSERVED in the game, and it has now been burned twice
    // by reading a proxy and reporting it as the quantity. A source read gives
    // the spawn table; a census gives the spawn table AND the growth curve AND
    // proof that both match what the bot actually sees through its own
    // gatherer, which is the thing that has silently failed before (ringHuge
    // could not fire from a corner until this version).
    //
    // Per boss id, first sighting only: gt, type/bossChar, radius, maxHp — plus
    // the radius re-sampled as it grows, so r(t) can be fitted across runs
    // rather than assumed. Cheap: bosses are a handful per run, and the census
    // is capped. Aggregated by `pineBot.bossCensus()`.
    const BOSS_CENSUS_KEY = nsKey('pineBotBossCensus_v1');
    let bossCensus = (() => {
        const blank = { runs: [] };
        try {
            const raw = JSON.parse(localStorage.getItem(BOSS_CENSUS_KEY) || 'null');
            if (raw && Array.isArray(raw.runs)) return raw;
        } catch (e) { }
        return blank;
    })();
    let bossSeen = {};
    // v6.102.0: gt at which the BUILD first met its armour+supers bars —
    // the measurement that sets capStable.fromS from data instead of guesswork.
    let capReadyGt = null;
    let capWpIdx = 0;               // v6.96.2 cap patrol: current waypoint on the circuit
    let capWpUntil = 0;             // ...and the gt deadline before the leg is abandoned
    let phaseAudit = (() => {
        const blank = { rows: [] };
        try {
            const raw = JSON.parse(localStorage.getItem(PHASE_AUDIT_KEY) || 'null');
            if (raw && Array.isArray(raw.rows)) return raw;
        } catch (e) { }
        return blank;
    })();

    const MARK_AUDIT_KEY = nsKey('pineBotMarkAudit');
    let markAudit = (() => {
        const blank = { buckets: {}, runs: 0 };
        try {
            const raw = JSON.parse(localStorage.getItem(MARK_AUDIT_KEY) || 'null');
            if (raw && raw.buckets) return Object.assign(blank, raw);
        } catch (e) { }
        return blank;
    })();
    function bookMarks(marks, prevSnap, gt, seatX, seatY) {
        if (!Array.isArray(marks) || !marks.length || typeof gt !== 'number') return;
        const key = String(Math.floor(gt / INC_BUCKET_S) * INC_BUCKET_S);
        let b = markAudit.buckets[key];
        if (!b) b = markAudit.buckets[key] = { n: 0, rSum: 0, rMin: null, rMax: null, covers: 0, worstMargin: null };
        const pad = CONFIG.threat.markPad || 0;
        for (const m of marks) {
            // first tick only: nothing within 3px of it in the previous snapshot
            if (prevSnap && prevSnap.some(q => Math.abs(q.x - m.x) < 3 && Math.abs(q.y - m.y) < 3)) continue;
            const rGame = (typeof m.r === 'number' ? m.r : 0) - pad;   // our padding is not the game's radius
            if (!(rGame > 0)) continue;
            b.n++; b.rSum += rGame;
            if (b.rMin == null || rGame < b.rMin) b.rMin = rGame;
            if (b.rMax == null || rGame > b.rMax) b.rMax = rGame;
            const margin = hyp(m.x - seatX, m.y - seatY) - rGame;
            if (b.worstMargin == null || margin < b.worstMargin) b.worstMargin = margin;
            if (margin <= 0) b.covers++;
        }
    }
    function bookHunt(mk, gtNow) {
        if (!mk) return;
        huntAudit.attempts++;
        if (mk.froz) huntAudit.frozenAttempts++;
        huntAudit.secs += Math.max(0, (gtNow || 0) - (mk.t0 || 0));
        // hp0 and hp are both null for a boss the game gave us no hp for — book
        // the attempt, book no damage, and do not invent a number.
        if (typeof mk.hp0 === 'number' && typeof mk.hp === 'number') {
            const d = mk.hp0 - mk.hp;
            if (d > 0) { huntAudit.dmg += d; if (d > huntAudit.best) huntAudit.best = d; }
        }
        if (mk.gone) huntAudit.vanished++;
        try { localStorage.setItem(HUNT_AUDIT_KEY, JSON.stringify(huntAudit)); } catch (e) { }
    }
    let lastHpSample = null;   // for damage-weighted death attribution
    const slowPadRef = { v: 1 };   // live slow-scaled safety multiplier (set each plan tick)
    const farmRef = { v: false };  // v6.95.0 day farm stance (set in gatherThreats, read by planMove)
    const th_nearRef = { v: 0 };   // live crowd pressure, for pick-time context
    const flightRef = { v: false };  // live flight-mode flag (unkillable chase)
    // v6.85.12: boss damage-ring instrument. bossHitD collects the player->boss
    // distance at every frame a boss's HP drops; its percentiles measure how
    // close the bot must be for its damage to land, which is currently a guess
    // (`e.r + 55`, capped at 150 in hell / 240 in day) and, per the user, wrong.
    const bossHpMem = new WeakMap();
    const bossHitD = [];
    // v6.85.2: last boss firing-ring the planner computed, in px. Diagnostic
    // only — nothing reads it to make a decision. It exists because the ring
    // is otherwise unobservable from outside planMove, which made the
    // per-character bossFloor impossible to test: a direction-based test
    // passes either way, since the contact-danger gradient already pushes
    // away from a boss regardless of where the ring sits.
    const bossRingRef = { v: null };
    let lastDeathCause = null;
    let enemyMix = { swarm: 0, ranged: 0, bomber: 0, boss: 0, total: 0 };  // rolling: what we're fighting
    // Enemy-scaling telemetry: measure the difficulty curve instead of assuming it.
    let killRate = 0, lastKillCount = null, lastKillAt = 0;   // kills/sec, rolling
    // v6.107.0 DROP ANCHOR telemetry — how often the anchor actually armed
    // and when it last did. Per-run; reported so the user can tell whether
    // the term is firing at all before asking whether it is paying.
    let dropAnchorTicks = 0, dropAnchorLastGt = 0;
    let passoutAvg = 0;                                       // rolling passout presence — loot piles waiting
    let pressureAvg = 0;                                      // avg nearby enemies, rolling
    let toughnessAvg = 1;                                     // avg enemy HP vs early-game reference
    let dpsDeficit = 0;                                       // 0 = cruising, 1 = losing the damage race
    // Milestones for reward shaping
    let supersThisRun = 0, craftsThisRun = 0, rainbowThisRun = false, dayClearedThisRun = false;
    let rainbowAt = 0;   // when the gun was taken — the fresh gun is weak, survival mode follows
    let rainbowChoice = null;   // this run's learned policy once the gun is offered in-window: 'take' | 'skip'
    let lastLevelUpAt = 0;      // upgrade cadence: a starving build means the loot hunt must intensify
    let seenTypesThisRun = {};  // enemy type -> first-seen gameTime (builds the MEASURED spawn timetable)
    let supersMade = new Set();   // names of super cocktails unlocked this run (hell-readiness gate)
    let runPickCtx = [];          // {name, x} per pick this run, credited at run end (LinUCB)
    let pickAudit = [];           // last picks with scores + reasoning — every selection is KEY (user)
    // v6.87.3: level-up pools where EVERY card walked an off-plan super line,
    // with what was offered and what had to be taken. Survives across runs so
    // a handful of hell entries is enough to characterise the mechanic.
    let gunForcedLog = [];

    let runActive = false;
    let runStart = 0;
    let runPicks = [];
    let runPickCounts = {};
    let primaryCocktail = null;         // the build we commit to
    let ownedLevels = {};               // NAME -> level, learned from level-up cards
    let ownedMax = {};                  // NAME -> maxlv
    // v6.89.0 (user: "manhattan seems to be the problem as the bot doesn't seem
    // to know black vermouth which is hidden still leads to a super cocktail").
    // A secret craft CONSUMES its parts: SWEET VERMOUTH + DRY VERMOUTH become
    // BLACK VERMOUTH and vanish from the ingredient bar, so ownedLevels loses
    // them. But the game keeps honouring the maxed key for super evolution —
    // which means the moment BLACK VERMOUTH is crafted, MANHATTAN (key SWEET
    // VERMOUTH) and VODKA MARTINI (key DRY VERMOUTH) become one Lv6 cocktail
    // away from a super, and SIMPLE SYRUP does the same for WHISKEY HIGHBALL
    // (key WATER). All three are OFF the plan, so any of them is the SIXTH
    // line = the Rainbow Gun. Every guard in the scorer read ownedLevels and
    // therefore went blind at exactly the moment the danger became real.
    // This set remembers what was maxed BEFORE it was absorbed.
    let everMaxed = new Set();          // ingredient names that have ever reached max level
    let lastPoolSig = null;
    let lastPickAt = 0;
    // v6.88.1 L1: the pool OBJECT we last acted on. The game builds a fresh
    // array for each level-up, so identity distinguishes "the same screen is
    // still up (our click missed)" from "a new level-up that happens to offer
    // the identical trio" — which a content signature cannot do. At LV 70 the
    // stat cards (FLAME CROSS +1s / TIME STOP +2s / TEQUILA SHOT +20) carry no
    // level, so consecutive pools are byte-identical several times a run.
    let lastPoolRef = null;
    const UNKNOWN_TYPES = new Set();   // v6.88.1: report an unscored card type once
    // v6.88.1 L4: the game's persistent chrome. The stuck-breaker blind-clicks
    // its way along every visible control, and these are always on the page:
    // clicking them opens modals that add MORE controls, so the breaker feeds
    // itself. An observed run spent 24 s cycling settings -> book -> STAFF ->
    // ITEMS -> CLOSE with a LEVEL UP sitting unanswered behind them. None of
    // these has ever advanced a stuck state.
    // v6.88.2 MARK ESCAPE. The 'again' drop-mark telegraphs for 0.6 s = 36
    // frames and lands with r 58; clearing it from dead centre needs about
    // 58 + player.r ~= 70 px of travel. That is a pure speed check, and it is
    // the reason the death tables split by character: PAT covers 1.9 * 36 =
    // 68.4 px and MISSES BY TWO PIXELS, while minguk makes 85.5 and joe 108.
    // Marks are 32-47% of pat's deaths across four rows (and his #1 cause in
    // three of them) versus 18-22% for minguk. MINT takes pat to 2.73 * 36 =
    // 98 px, i.e. it converts an undodgeable hit worth 40% of MAX HP into a
    // dodgeable one. For pat MINT is a survival stat, not a mobility perk;
    // for the two runners it is already redundant on this axis, so the bonus
    // is computed from the character's own speed rather than granted flat.
    const MARK_TELE_FRAMES = 36;   // 0.6 s at 60 fps ('again' is the tightest)
    const MARK_CLEAR_PX = 70;      // r 58 + player radius ~12
    const CHROME_CTRL = /^(save|settings|options|close|recipes?|mobs?|staff|items|drinks|book|index|music|sfx|sound|mute|pause|resume|quit|exit|menu|credits|help|language|한국어|english)\b|^[⚙📖⏸⏯🔇🔊🔈✕✖×☰❓]/i;
    let levelupStuckAt = 0;     // v6.88.1 L3: level-up watchdog, owned by the levelup handler
    let saveWarned = false;     // v6.88.0 AUDIT R1: surface a quota failure once, not never
    let craftPending = null;
    let craftStateBooked = false;   // v6.122.0: dedupe for STATE_HANDLERS.craft
    // v6.88.0 AUDIT C1: signature of the fusion prompt we have already clicked
    // ── v6.118.0 THE CRAFT PROMPT, MEASURED RATHER THAN GUESSED ─────────────
    //
    // USER: "there's also a bug where black vermouth craft doesn't trigger."
    // The manual digest is consistent with that — `sweetver: 6, dryver: 6` at
    // minute 76 and no BLACK VERMOUTH — but consistent is not the same as
    // proof, and this exact bug has now been "fixed" twice on a guess:
    //   6.87.5 put takeCraftPrompt() in STATE_HANDLERS.playing()...
    //   6.87.6 found handleScreens RETURNS before that dispatch, so it was
    //          dead code, and moved it to the top of the playing branch.
    // A third guess is not worth shipping. There are four distinct things that
    // could be true and the report cannot currently tell them apart:
    //   (a) the prompt never appears (the game's own trigger did not fire),
    //   (b) it appears and no selector matches it (label/markup changed),
    //   (c) it matches and the click does not land,
    //   (d) it lands and the game refuses (no free slot).
    // So: record what is actually seen. `ready` counts ticks where both craft
    // parts are maxed and a craft is therefore owed; `seen` counts ticks a
    // prompt was on screen; `labels` keeps what the buttons actually said —
    // which is the one piece of evidence that separates (a) from (b).
    const CRAFT_AUDIT_KEY = nsKey('pineBotCraftAudit_v1');
    let craftAudit = (() => {
        try { return JSON.parse(localStorage.getItem(CRAFT_AUDIT_KEY)) ||
            { runs: 0, ready: 0, seen: 0, clicked: 0, confirmed: 0, labels: {}, pairs: {} }; }
        catch (e) { return { runs: 0, ready: 0, seen: 0, clicked: 0, confirmed: 0, labels: {}, pairs: {} }; }
    })();
    function craftAuditSave() {
        try { localStorage.setItem(CRAFT_AUDIT_KEY, JSON.stringify(craftAudit)); } catch (e) { }
    }
    // v6.122.0: `ready` and `seen` were incremented in memory and NEVER
    // saved — craftAuditSave() was called only after `clicked` and
    // `confirmed`. So unless a craft was actually clicked, every reload wiped
    // them and the audit reported `ready: 0, seen: 0` forever. That is why
    // "does the BLACK VERMOUTH pair ever reach 6/6?" has been unanswerable
    // for four versions. Throttled to once a second: takeCraftPrompt runs
    // every 260 ms and a localStorage write per tick is not free.
    let craftAuditSavedAt = 0;
    function craftAuditNote(kind, label) {
        craftAudit[kind] = (craftAudit[kind] || 0) + 1;
        const nowCA = Date.now();
        if (nowCA - craftAuditSavedAt > 1000) { craftAuditSavedAt = nowCA; craftAuditSave(); }
        if (label) {
            const k = String(label).slice(0, 40);
            craftAudit.labels[k] = (craftAudit.labels[k] || 0) + 1;
        }
    }
    let lastRerollSig = null;   // one GINGER BEER re-roll per weak pool, max
    let hellDetected = false;
    let hellEnteredAt = 0;      // when this run crossed into hell (the entry surge is the killer)
    let hellRunEnded = false;   // was the run that just FINISHED a hell run? (set at finishRun)
    let bartenderThisRun = null;
    let lastRunStats = null;
    let stopReason = null;

    let lastState = null, lastStateAt = 0, stuckTries = 0, hellTries = 0;
    let lastGiveUp = null;   // snapshot of on-screen controls when hell-entry search gave up
    let lastPlan = null;
    let moveSource = 'starting…';
    let lastAction = '—';
    let deathSnapshot = null;

    const log = (...a) => { if (CONFIG.debug) console.log('[PineBot]', ...a); };

    // =================================================================
    // LEXICAL GLOBAL ACCESS
    // The game declares these with let/const at the top level of a classic
    // script, so they are NOT on window. Bare references resolve via the
    // scope chain; try/catch turns a missing binding into undefined.
    // =================================================================
    // v6.91.2 READ THE STAT, NOT THE INGREDIENT NAME.
    //
    // Live probe, gt 2218, lv 58: `player.defense` = 34.992 — the CAP — while
    // `ownedLevels['OLIVE']` read 1. In-run upgrade levels are stored under
    // "OLIVE UP"; the bare "OLIVE" key goes to 1 when the ingredient is first
    // acquired and never moves again. (Same dump: "OLIVE UP" 4, "WATER UP" 3,
    // "OLIVE" 1, "WATER" 1.)
    //
    // Every armour-permission gate in the planner has therefore been comparing
    // 1 against thresholds of 2, 4 and 6 — including 6.90.0's `parkArmor`,
    // which needs 6. DEEP PARK HAS NEVER ENGAGED IN A REAL RUN. Neither has the
    // armour half of the anchor, and `armorEase`/`armorConf` have been telling
    // the planner it is unarmoured while it stood at the defense cap.
    //
    // The fix is not to chase the right key name. `player.defense` and
    // `player.regenBonus` are what `recalcStats` produces and what `hurtPlayer`
    // actually subtracts. They cannot drift out of sync with the pool, the
    // naming, or the ingredient stack. The ownedLevels path stays only as a
    // fallback for reads before the game object exists.
    // SCOPE, deliberately narrow: only the PARK gates are migrated in 6.91.2.
    // Four other call sites read the same broken key and are also wrong —
    //   05-movement `armorEase` (fear scaling), `armorLv`/`armorConf` (caution),
    //   `crowdTol`, the anchor's `OLIVE >= 2` permission — plus 03-scoring's
    //   `defLv`. Migrating all of them at once means shipping five untested
    //   behaviour changes in one commit, and one of them (`tank-holdout`:
    //   "armour is measured off the OLIVE + NEGRONI levels") asserts the old
    //   reading directly, so it has to be revised on purpose rather than made
    //   to pass. They stay as they are until each has its own evidence.
    const ARMOR_PER_LEVEL = 5.832;   // olive.pas.per 4 x the 1.458 ingredient stack
    // v6.112.0: the hard ceiling the game can produce — min(60, 3*upDefense +
    // pas.armor) with upDefense unobtainable and OLIVE capped at 6. The 60 in
    // the source is decoration. Named so no threshold is ever again written
    // above a value the game cannot reach (capStable.defMin 35 vs 34.992).
    const ARMOR_CAP = 6 * ARMOR_PER_LEVEL;   // 34.992
    function liveDefense() {
        const d = safe(() => player.defense, null);
        return (typeof d === 'number' && d > 0) ? d : null;
    }
    // v6.91.3: total armour in LEVEL units — the same scale the old
    // `OLIVE + NEGRONI` expression was reaching for, but read off the stat that
    // hurtPlayer actually subtracts. OLIVE 6 alone gives defense 34.992, which
    // is exactly 6.0 here, so the units line up with what the call sites expect
    // and their CEM-tuned dials keep their learned meaning.
    function armorLevel() {
        const d = liveDefense();
        if (d != null) return Math.min(12, d / ARMOR_PER_LEVEL);
        return (ownedLevels['OLIVE'] || 0) + (ownedLevels['NEGRONI'] || 0);
    }
    function regenRate() {
        const r = safe(() => player.regenBonus, null);
        if (typeof r === 'number' && r > 0) return r;
        return 0.284 * (ownedLevels['WATER'] || 0) + 0.512 * (ownedLevels['SIMPLE SYRUP'] || 0);
    }

    // ── v6.132.0 THE BUILD GATE, replacing capStable.supersMin ──────────────
    //
    // USER: "let's remove this from the rule and instead replace it with has
    // southside, simple syrup, olives, and sweet vermouth or black vermouth
    // all maxed out."
    //
    // WHY THE OLD BAR WAS WRONG. `supersMin: 3` counted super EVOLUTIONS, and
    // the funnel had already recorded it as the binding constraint on nearly
    // every ready build. The live report the user pasted made it concrete: hp
    // and defense both passed, `supers: 2` alone held the gate shut, and the
    // hold clock had therefore banked zero seconds with ~1,090 game-seconds
    // left. Supers are also the part of the build the bot controls least — a
    // line arms only when the pool happens to offer its key's last level. The
    // four ingredients below are what the run is actually built for, and the
    // planner steers toward all four on purpose.
    //
    // WHY IT READS `player.weapons` AND NOT `ownedLevels`. This is 6.91.2's
    // lesson, and it is the single most expensive naming mistake in the
    // project. A live probe at gt 2218 read `player.defense` 34.992 — the cap
    // — while `ownedLevels['OLIVE']` read 1, because in-run upgrade levels
    // land under "OLIVE UP" and the bare key freezes at 1 the moment the
    // ingredient is first acquired. Four armour gates spent four versions
    // comparing 1 against thresholds of 2, 4 and 6, and deep park never
    // engaged in a single real run. A gate keyed on `ownedLevels['OLIVE']`
    // would reproduce that failure exactly.
    //
    // `player.weapons` is the game's own combined map, and three independent
    // live dumps recorded in this file agree on its shape: lowercase, squashed
    // and ABBREVIATED keys with plain numeric levels — `southside: 6`,
    // `olive: 6`, `sweetver: 6`, `dryver: 6`, plus the craft results `syrup`
    // and `blackver`. Note `sweetver`, not `sweetvermouth`: a generic
    // squash of the display name does NOT produce the key the game uses, so
    // the measured spellings are listed first and the squash is only a
    // fallback. applyCraft leaves consumed materials in `weapons` at full
    // level ("능력치 효과는 계속 적용되고, 슬롯 카운트에서만 빠짐"), so this
    // reading survives the BLACK VERMOUTH craft that eats SWEET VERMOUTH.
    //
    // AND IT SELF-REPORTS. Every leg carries the key that actually answered
    // and where the number came from, and `capStatus().build` prints them. If
    // a spelling is wrong the first report after install shows `key: null,
    // src: 'none'` on that leg — instead of the rule quietly never firing
    // again for four versions, which is precisely how this class of bug has
    // cost this project every time.
    const BUILD_WEAPON_KEYS = {
        'SOUTH SIDE': ['southside'],
        'SIMPLE SYRUP': ['syrup', 'simplesyrup'],
        'OLIVE': ['olive'],
        'SWEET VERMOUTH': ['sweetver', 'sweetvermouth'],
        'BLACK VERMOUTH': ['blackver', 'blackvermouth'],
        'DRY VERMOUTH': ['dryver', 'dryvermouth']
    };
    // v6.132.1 A CRAFT RESULT IS BINARY, AND 6.132.0 READ IT AS A LEVEL.
    //
    // USER, on a live run the rule refused: "this should be counted as an
    // immortal build", then "simple syrup disappears from the ingredients list
    // like the black vermouth once crafted."
    //
    // The report proves it. At gt 5179, `player.weapons` read:
    //     water 6  sugar 6  syrup 1        <- SIMPLE SYRUP = WATER + SUGAR
    //     sweetver 6  dryver 6  blackver 1 <- BLACK VERMOUTH = the vermouths
    //     ...and EVERY other entry at 6.
    // Both crafts had fired. The two craft RESULTS are the only keys not at 6,
    // and they sit at exactly 1 because a crafted item leaves the ingredient
    // pool — it can never be offered again, so its level can never move. 1 is
    // COMPLETE, not 1-of-6.
    //
    // 6.132.0 compared that 1 against `ownedMax[name] || 6` and refused a build
    // holding all four named ingredients at def 35 (the cap), hp 1.00 and four
    // supers. That is the SAME failure as the ownedLevels['OLIVE'] trap
    // documented above — a value meaning "owned" read as a level against a
    // threshold of 6 — reproduced inside the very gate written to avoid it.
    // The self-report is what caught it: `SIMPLE SYRUP 1/6 (weapons)` in
    // `cap.short.buildShort` named the clause and showed the raw number, so
    // the bug surfaced in one run instead of the four versions the OLIVE trap
    // cost. That is the whole argument for making a gate report its inputs.
    //
    // So: a name that is an EVOLUTIONS *result* has max 1. Not `min(1, ...)`
    // of a pool-derived value — hard 1, because ownedMax can be seeded from a
    // card the pool offered before the craft and would put the bar back at 6.
    const CRAFT_RESULTS = (() => {
        const s = new Set();
        try { for (const e of EVOLUTIONS) if (e && e.result) s.add(e.result); } catch (e) { }
        return s;
    })();
    function buildKeyLevel(name) {
        const max = CRAFT_RESULTS.has(name) ? 1 : (ownedMax[name] || 6);
        const cands = (BUILD_WEAPON_KEYS[name] || []).slice();
        const squash = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cands.indexOf(squash) < 0) cands.push(squash);
        // 1. the game's own map. Object of key->level in every dump; an array
        //    of entries is accepted too so a shape change degrades to a miss
        //    on one leg rather than a thrown planner tick.
        const w = safe(() => player.weapons, null);
        const lvOf = (v) => typeof v === 'number' ? v
            : (v && typeof v === 'object' && typeof v.lv === 'number') ? v.lv
            : (v && typeof v === 'object' && typeof v.level === 'number') ? v.level : null;
        if (w && typeof w === 'object') {
            if (Array.isArray(w)) {
                for (const e of w) {
                    const k = String((e && (e.key || e.n || e.name)) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cands.indexOf(k) < 0) continue;
                    const lv = lvOf(e);
                    if (lv != null) return { lv, max, key: k, src: 'weapons' };
                }
            } else {
                for (const k of cands) {
                    const lv = lvOf(w[k]);
                    if (lv != null) return { lv, max, key: k, src: 'weapons' };
                }
            }
        }
        // 2. the levels we scored ourselves. "OLIVE UP" FIRST — that is where
        //    in-run upgrades actually land; the bare key is the acquisition
        //    flag that froze at 1 and fooled every armour gate before 6.91.2.
        const up = ownedLevels[name + ' UP'];
        if (typeof up === 'number' && up > 0) return { lv: up, max: ownedMax[name + ' UP'] || max, key: name + ' UP', src: 'owned' };
        const own = ownedLevels[name];
        if (typeof own === 'number' && own > 0) return { lv: own, max, key: name, src: 'owned' };
        // 3. the absorbed-key blind spot (6.89.0): a craft eats its parts, so
        //    a maxed half can leave every live reading behind.
        if (typeof keyEffectivelyMaxed === 'function' && safe(() => keyEffectivelyMaxed(name), false)) {
            return { lv: max, max, key: name, src: 'absorbed' };
        }
        if (everMaxed.has(name) || everMaxed.has(name + ' UP')) return { lv: max, max, key: name, src: 'evermaxed' };
        return { lv: 0, max, key: null, src: 'none' };
    }
    // Clauses are AND across, OR within: [['SOUTH SIDE'], ['SIMPLE SYRUP'],
    // ['OLIVE'], ['SWEET VERMOUTH','BLACK VERMOUTH']]. An absent or empty
    // `build` list is the off switch and passes, so the gate can be disabled
    // from config without a code change.
    // v6.132.0 THE TICK BILL. planMove calls this every tick, and the tick is
    // gated on GAME time — at medianSpeed 15 that is ~455 calls per wall
    // second (optimizer-ceiling.md), so a per-call array of leg objects is 455
    // allocations/s for a value that changes a handful of times per run.
    // Levels only ever go UP, so the pass is MONOTONE: once every clause is
    // satisfied it stays satisfied for the run, and `buildGateLatched` short-
    // circuits to a shared frozen result. Before that it recomputes at most
    // once per game-second. `buildGateState(true)` forces a fresh read for the
    // report, which must never show a cached picture.
    let buildGateLatched = false, buildGateAt = -1e9, buildGateLast = null;
    const BUILD_GATE_OK = { ok: true, legs: [], clauses: 0, latched: true };
    // ONE reset, called from every run boundary — startRun (04) and both test
    // resetters (06). The first cut cleared it only in startRun, and six
    // scenarios went red: a latch taken on a complete build stayed set into
    // the next scene, so a build one level short still passed the gate. That
    // is the production hazard too — a latch surviving into a run that has
    // not bought a card would cap it immortal on its first stable tick.
    function resetBuildGate() { buildGateLatched = false; buildGateAt = -1e9; buildGateLast = null; }
    function buildGateState(force) {
        if (buildGateLatched && !force) return BUILD_GATE_OK;
        if (!force) {
            const gtB = safe(() => gameTime, 0) || 0;
            if (buildGateLast && (gtB - buildGateAt) < 1 && gtB >= buildGateAt) return buildGateLast;
            buildGateAt = gtB;
        }
        const r = buildGateCompute();
        if (!force) { buildGateLast = r; if (r.ok) buildGateLatched = true; }
        return r;
    }
    function buildGateCompute() {
        const CS = (CONFIG.deepHell && CONFIG.deepHell.capStable) || {};
        const clauses = Array.isArray(CS.build) ? CS.build : [];
        const legs = [];
        let ok = true;
        for (const clause of clauses) {
            const names = Array.isArray(clause) ? clause : [clause];
            let best = null, done = false;
            for (const n of names) {
                const r = buildKeyLevel(n);
                r.name = n;
                if (r.lv >= r.max && r.max > 0) { best = r; done = true; break; }
                if (best == null || r.lv > best.lv) best = r;
            }
            if (!done) ok = false;
            legs.push({ need: names.join(' or '), ok: done, name: best.name,
                lv: best.lv, max: best.max, key: best.key, src: best.src });
        }
        return { ok, legs, clauses: clauses.length, latched: false };
    }

    // ── v6.112.0 CONTACT BREAK-EVEN ─────────────────────────────────────────
    //
    // USER: "normal mob damage can be absorbed and countered with simple
    // syrup's healing regen rate." That is exactly right, and it has a number
    // attached that the park gate was not using.
    //
    //   hurtPlayer sets player.invuln = 38 frames, and the invuln is on the
    //   PLAYER, not per-attacker — so total incoming contact is rate-limited
    //   at 60/38 = 1.579 hits/s no matter how many bodies are touching us.
    //   That is why 260 enemies do the same contact dps as one.
    //
    //   Armour is FLAT subtraction with a floor of 1. Common contact is ~22.4,
    //   so at any defense >= 21.4 every common hit does exactly 1 damage.
    //
    //   => break-even regen at armour cap = 1.579 * 1 = 1.579 HP/s.
    //
    // `deepHell.parkRegenRate` is 1.0. A build that just clears it is losing
    // 0.58 HP/s while parked — it does not die fast, it dies slowly, which is
    // precisely the failure the funnel recorded: of 13 ready builds, 7 died
    // naturally between 2523 and 7394 s "because their hold never completed".
    // parkAudit's seated median regen is 1.42: also below break-even. The one
    // confirmed 13,244 s run sat at 2.218 — net +0.64 HP/s.
    //
    // For JOE this is entirely a pick problem: innate regen is ZERO (the
    // (0.035+(lv-1)*0.025)*1.1 term is pat/minguk only). SIMPLE SYRUP pays
    // 0.512/level and WATER 0.284, so break-even is SIMPLE SYRUP 4 — or WATER
    // 6, the entire cap, for less. The user named the right ingredient.
    // Returns null when armour cannot be read at all. Callers must treat null
    // as "no opinion" and fall back to their flat threshold — NEVER as zero
    // armour. The first draft defaulted `def` to 0, which makes the break-even
    // 1.579 * 22.4 = 35.4 HP/s: a bar no build in this game can reach, silently
    // closing the park gate for good. That is the same unreachable-threshold
    // failure as capStable.defMin 35 vs a 34.992 ceiling, which killed the
    // early cap for four versions — reproduced here within one build, and
    // caught only because four existing park scenarios went red.
    function contactBreakEven() {
        const M = CONFIG.mitigation || {};
        const hz = 60 / (M.invulnFrames || 38);
        const dmg = M.contactDmg != null ? M.contactDmg : 22.4;
        // liveDefense() first (the stat hurtPlayer actually subtracts), then
        // the armour the owned levels imply. Both unavailable = no opinion.
        let def = liveDefense();
        if (def == null) {
            const lv = (ownedLevels['OLIVE'] || 0) + (ownedLevels['NEGRONI'] || 0);
            if (lv <= 0) return null;
            def = Math.min(ARMOR_CAP, lv * ARMOR_PER_LEVEL);
        }
        return hz * Math.max(1, dmg - def);
    }

    function safe(fn, fallback) {
        try { const v = fn(); return v === undefined ? fallback : v; } catch (e) { return fallback; }
    }

    // v6.125.0 THE PLANNER'S CPU BILL — PART 1 OF 4: `Math.hypot` IS SLOW.
    //
    // Measured, node 20, the exact shape of the candidate scan (33 candidate
    // directions x 260 enemies x 6 passes): Math.hypot 2.894 ms per tick,
    // this helper 1.195 ms per tick — a 2.42x difference on nothing but the
    // distance call. Math.hypot is variadic and overflow-safe (it rescales by
    // the largest magnitude so hypot(1e200, 1e200) does not become Infinity),
    // and V8 cannot inline it. On a 540 x 540 canvas the largest value either
    // leg can ever hold is 540, so the overflow safety it charges for is
    // unreachable. Nothing about the geometry changes: this returns the same
    // double for every input the game can produce.
    //
    // Why it mattered: the planner tick is gated on GAME time (33 ms), and
    // the game's frame multiplier makes rAF fire once per VIRTUAL frame — so
    // at the measured medianSpeed of 15 the planner runs ~455 times per WALL
    // second, not 30. 2.894 ms x 455 = 1.3 CPU-seconds per wall-second, i.e.
    // the planner alone wanted more than a whole core in deep hell, which is
    // exactly where `spdLo` bottoms out and where runs die.
    //
    // All 108 `Math.hypot` call sites were 2-argument (verified by a paren-
    // matching pass over the source, not by eye) and every one of them now
    // calls this.
    function hyp(a, b) { return Math.sqrt(a * a + b * b); }

    // v6.125.0: the BUILD HUNGER loot kinds. Was an inline array literal
    // inside planMove's loot loop — allocated fresh and linearly scanned for
    // every loot item on every tick.
    const HUNGER_KINDS = new Set(['xp', 'gem', 'exp', 'star', 'ingredient', 'bottle', 'tip']);

    // v6.126.0: the danger-field scratch arrays (see planMove's builder).
    // Module-scope and grown on demand so a 260-enemy tick allocates nothing;
    // `kind` is a small-int array, the rest are doubles.
    const DPOOL = { fx: new Float64Array(0) };
    function dpoolGrow(n) {
        const cap = Math.max(64, n * 2);
        for (const k of ['fx', 'fy', 'c2', 'r', 'cpad', 'reach', 'kc', 'kp', 'kt', 'kr']) DPOOL[k] = new Float64Array(cap);
        DPOOL.kind = new Uint8Array(cap);
    }
    dpoolGrow(0);

    const G = {
        get player() { return safe(() => player, null); },
        get enemies() { return safe(() => enemies, null); },
        get eprojectiles() { return safe(() => eprojectiles, null); },
        get pickups() { return safe(() => pickups, null); },
        get dropMarks() { return safe(() => dropMarks, null); },
        get roadLines() { return safe(() => roadLines, null); },
        get state() { return safe(() => state, null); },
        // finale chase state: { active, until, rival } — the rival (JOE/PAT)
        // chases the player and hits for 50% of max HP (source-verified)
        get finale() { return safe(() => finale, null); },
        get gameTime() { return safe(() => gameTime, null); },
        get surgeUntil() { return safe(() => surgeUntil, null); },
        get money() { return safe(() => money, null); },
        get killCount() { return safe(() => killCount, null); },
        get keys() { return safe(() => keys, null); },
        get W() { return safe(() => W, null); },
        get H() { return safe(() => H, null); }
    };

    function haveRealState() {
        const p = G.player;
        return !!(p && typeof p.x === 'number' && typeof p.y === 'number');
    }

    function fieldSize() {
        const w = G.W, h = G.H;
        if (typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0) return { w, h };
        const c = document.querySelector('#game') || document.querySelector(CONFIG.canvasSelector);
        if (c && c.width > 0) return { w: c.width, h: c.height };
        return { w: CONFIG.field.w, h: CONFIG.field.h };
    }

    const hasGame = n => { try { return typeof window[n] === 'function'; } catch (e) { return false; } };

    // Call a game function if it exists. Never throws.
    function callGame(name, ...args) {
        try {
            const f = window[name];
            if (typeof f !== 'function') return { ok: false, reason: 'missing' };
            const v = f.apply(window, args);
            lastAction = name + '(' + args.map(a => JSON.stringify(a)).join(',') + ')';
            log('call', lastAction);
            return { ok: true, value: v };
        } catch (e) {
            log('call failed', name, e && e.message);
            return { ok: false, reason: 'threw', error: e };
        }
    }

    // Try a list of game functions in order; first one that exists wins.
    function callFirst(names, ...args) {
        for (const n of names) if (hasGame(n)) { const r = callGame(n, ...args); if (r.ok) return n; }
        return null;
    }

    // =================================================================
    // INPUT
    // The game's keydown handler stores lowercase e.key into `keys`.
    // We both dispatch real events AND write the flags directly, so
    // movement works even if the listener is attached somewhere we miss.
    // =================================================================
    const DIR_KEYS = {
        up: { key: 'w', code: 'KeyW' },
        down: { key: 's', code: 'KeyS' },
        left: { key: 'a', code: 'KeyA' },
        right: { key: 'd', code: 'KeyD' }
    };

    function writeKeyFlag(k, down) {
        const store = G.keys;
        if (!store) return false;
        try {
            if (typeof Set !== 'undefined' && store instanceof Set) {
                if (down) store.add(k); else store.delete(k);
                return true;
            }
            if (typeof Map !== 'undefined' && store instanceof Map) {
                if (down) store.set(k, true); else store.delete(k);
                return true;
            }
            if (typeof store === 'object') {
                if (down) store[k] = true; else delete store[k];
                return true;
            }
        } catch (e) { /* frozen or exotic */ }
        return false;
    }

    function dispatchKey(type, key, code) {
        let ev;
        try { ev = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }); }
        catch (e) { return; }
        try { window.dispatchEvent(ev); } catch (e) { }
        try { document.dispatchEvent(ev); } catch (e) { }
        try { if (document.body) document.body.dispatchEvent(ev); } catch (e) { }
    }

    function setHeld(want) {
        for (const name of Object.keys(DIR_KEYS)) {
            const { key, code } = DIR_KEYS[name];
            const shouldHold = want.has(name);
            const holding = heldKeys.has(name);
            if (shouldHold && !holding) { dispatchKey('keydown', key, code); heldKeys.add(name); }
            else if (!shouldHold && holding) { dispatchKey('keyup', key, code); heldKeys.delete(name); }
            // reinforce the flag every tick — idempotent, and immune to lost events
            writeKeyFlag(key, shouldHold);
        }
    }

    function releaseAll() {
        for (const name of Object.keys(DIR_KEYS)) {
            const { key, code } = DIR_KEYS[name];
            if (heldKeys.has(name)) dispatchKey('keyup', key, code);
            writeKeyFlag(key, false);
        }
        heldKeys.clear();
        lastDir = { x: 0, y: 0 };
        smoothVec = { x: 0, y: 0 };
    }

    function driveDirection(dx, dy) {
        const want = new Set();
        const dead = 0.28;
        if (dx > dead) want.add('right'); else if (dx < -dead) want.add('left');
        if (dy > dead) want.add('down'); else if (dy < -dead) want.add('up');
        setHeld(want);
    }


    // =================================================================
    // LEARNING (UCB bandit over item names + (1+1) param hill-climb)
    // =================================================================

    // Distribution stats for one rollup: median / SD / SE and the share of
    // runs past the 60- and 120-minute marks. Works off the stored time
    // list when present; falls back to the running sums.
    function rollupStats(vs) {
        const n = vs && vs.n ? vs.n : 0;
        if (!n) return {};
        const ts = Array.isArray(vs.times) ? vs.times.filter(t => isFinite(t)) : [];
        const mean = vs.sumT / n;
        let sd = null;
        if (isFinite(vs.sumT2) && n > 1) sd = Math.sqrt(Math.max(0, vs.sumT2 / n - mean * mean) * n / (n - 1));
        else if (ts.length > 1) { const m = ts.reduce((a, b) => a + b, 0) / ts.length; sd = Math.sqrt(ts.reduce((a, b) => a + (b - m) * (b - m), 0) / (ts.length - 1)); }
        let median = null;
        if (ts.length) { const s = ts.slice().sort((a, b) => a - b); const h = s.length >> 1; median = s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2); }
        const p60 = isFinite(vs.over60) ? +(vs.over60 / n).toFixed(2) : (ts.length ? +(ts.filter(t => t >= 3600).length / ts.length).toFixed(2) : null);
        const p120 = isFinite(vs.over120) ? +(vs.over120 / n).toFixed(2) : (ts.length ? +(ts.filter(t => t >= 7200).length / ts.length).toFixed(2) : null);
        return {
            medianTimeS: median, sdTimeS: sd == null ? null : Math.round(sd),
            seTimeS: sd == null ? null : Math.round(sd / Math.sqrt(n)),
            p60, p120, timesKept: ts.length,
            timesPartial: vs.timesPartial === true || undefined
        };
    }

    // Freeze one version's rollup into learn.snapshots. Idempotent per
    // (version, runs) pair; a re-freeze with new runs REPLACES the old one.
    function freezeSnapshot(d, tag, reason) {
        try {
            const vs = d.versions && d.versions[tag];
            if (!vs || !vs.n) return false;
            d.snapshots = d.snapshots || [];
            const rec = {
                version: tag, frozenAtRun: d.runs, reason: reason || 'version-change',
                frozenAt: new Date().toISOString(),
                runs: vs.n,
                meanTimeS: Math.round(vs.sumT / vs.n), bestTimeS: Math.round(vs.bestT),
                meanDowns: Math.round((vs.sumD || 0) / vs.n), meanSales: Math.round((vs.sumS || 0) / vs.n),
                meanReward: +(vs.sumR / vs.n).toFixed(3), rewardEpoch: vs.epoch,
                hellRate: +(vs.hell / vs.n).toFixed(2), dayClearRate: +(vs.day / vs.n).toFixed(2),
                supersPerRun: +(vs.sumSupers / vs.n).toFixed(1),
                deaths: { ...(vs.deaths || {}) },
                top: (vs.top || []).slice(),
                runRange: [vs.firstRun, vs.lastRun],
                ...rollupStats(vs)
            };
            const i = d.snapshots.findIndex(s => s.version === tag);
            if (i >= 0) d.snapshots[i] = rec; else d.snapshots.push(rec);
            while (d.snapshots.length > CONFIG.learning.snapshotKeep) d.snapshots.shift();
            return true;
        } catch (e) { return false; }
    }

    function loadLearn() {
        // v6.88.0 AUDIT R2: the JSON.parse calls were wrapped but every
        // structural access after them was not, and `d.x = d.x || {}` does not
        // catch a wrong TYPE. A stored {"cem":{"mean":5}} passed the truthiness
        // guard and then threw on property assignment to a number — and because
        // loadLearn runs at module scope, that throw aborted the whole IIFE and
        // NO PART of the bot loaded, permanently, until localStorage was cleared
        // by hand. With @grant none the script shares storage with the game
        // page, so this was reachable by anything with same-origin write access.
        //
        // ── v6.122.0 THE HANDLER ITSELF THREW, AND IT BRICKED THE SCRIPT ──
        //
        // The line below used to call `log(...)`. `log` is a `const` declared
        // 564 lines later in 01-config-data.js, and `loadLearn()` runs at
        // MODULE SCOPE (`let learn = loadLearn();`). So every structural throw
        // inside loadLearnInner hit a temporal-dead-zone ReferenceError on the
        // FIRST LINE OF ITS OWN RECOVERY — which propagated out of the IIFE and
        // did exactly what the comment above says the 6.88.0 fix prevented:
        // no panel, no window.pineBot, no bot, permanently.
        //
        // Worse, it threw BEFORE the `.broken` copy and the removeItem on the
        // next line, so the poison blob survived every reload and the recovery
        // could never run. The file even predicted this at line ~296 — "(The
        // pre-existing `log` in the catch above has the same latent fault; it
        // has simply never fired.)" — and left it. It fires. Reproduced three
        // ways through test/fake-env: a numeric `cem.mean`, a numeric
        // `shared.snapshots`, a string `shared.versions`; each aborted the
        // whole script with "Cannot access 'log' before initialization".
        //
        // console is always available at module scope; `log` is not. This
        // handler must never depend on anything declared after it.
        try { return loadLearnInner(); }
        catch (e) {
            try { console.log('[PineBot] STORE UNREADABLE (' + (e && e.message) + ') — starting from defaults; the old blob is kept under ' + learnKey('.broken')); } catch (e3) { }
            try { localStorage.setItem(learnKey('.broken'), localStorage.getItem(learnKey()) || ''); localStorage.removeItem(learnKey()); } catch (e2) { }
            try { return loadLearnInner(); } catch (e2) { return blankLearn(); }
        }
    }
    function blankLearn() {
        return {
            bartender: activeChar || 'minguk', items: {}, totalPicks: 0, history: [], runs: 0,
            builds: {}, hof: [], genHistory: [], runLog: [], rosters: {}, versions: {}, snapshots: [],
            rewardEpoch: REWARD_EPOCH, cem: null, linucb: {},
            // v6.122.0: the last-resort store has to be USABLE, not merely
            // well-formed. These five were missing, and every one of them is
            // dereferenced outside a guard by code that runs on the next tick:
            //   finishRun     -> learn.spawnIntel[k], learn.rainbowPolicy[...]
            //   scoreCard     -> learn.tagucb
            //   gatherThreats -> learn.enemyTypeMul / enemyTypeN
            // So the designated recovery path handed back an object that threw
            // again a moment later. It was masked only because the TDZ bug
            // above killed the script before anything could reach it.
            spawnIntel: {}, rainbowPolicy: {}, tagucb: {},
            enemyTypeMul: {}, enemyTypeN: {}, lastVersion: null
        };
    }
    function loadLearnInner() {
        let d = null;
        try { d = JSON.parse(localStorage.getItem(learnKey())); } catch (e) { }
        // v6.96.2 BACKUP HEAL. The silent catch above is where 153 joe runs
        // died on 2026-08-29: an unreadable (or vanished) primary blob fell
        // through to `d = {}` with no log, no .broken copy, nothing — the
        // outer loadLearn wrapper only catches STRUCTURAL throws below this
        // line, so a clean parse failure reset the store invisibly. Every
        // successful save now leaves a `__bak` copy (see saveLearn); when the
        // primary is missing or unreadable, the backup — at worst one save
        // old — is the store.
        if (!d || typeof d !== 'object') {
            try {
                const b = JSON.parse(localStorage.getItem(learnKey('__bak')));
                if (b && typeof b === 'object') {
                    d = b;
                    log('own store missing/unreadable — HEALED from backup (' + (b.runs || 0) + ' runs recovered)');
                }
            } catch (e) { }
        }
        if (!d || typeof d !== 'object') d = {};
        // SHARED comparison state overlays the per-bartender blob. First
        // load migrates the legacy blob's versions/snapshots into the shared
        // store so history is never lost when a new bartender starts fresh.
        let shared = null;
        try { shared = JSON.parse(localStorage.getItem(SHARED_KEY)); } catch (e) { }
        if (!shared || typeof shared !== 'object') {
            let legacy = null;
            try { legacy = JSON.parse(localStorage.getItem(CONFIG.learning.storageKey)); } catch (e) { }
            shared = { versions: (legacy && legacy.versions) || {}, snapshots: (legacy && legacy.snapshots) || [], lastVersion: legacy && legacy.lastVersion };
        }
        // v6.127.0 SKILL IS SHARED, TRACK RECORD IS NOT (user: "Joe, Pat, and
        // Minguk should have similar roadmaps... same weapon pool, same
        // learnings on cem"). Everything that represents how good the bot IS
        // — the CEM movement/threat/strategy optimizer, the cocktail/
        // ingredient priority bandits, the contextual bandit, learned enemy
        // damage multipliers, spawn timetable, crown-path bandit — moves into
        // the SAME shared blob every bartender already used for `versions`/
        // `snapshots`, so a run under ANY character improves the search for
        // ALL of them and none of it goes stale just because attention moved
        // to a different bartender for 40 versions. What stays PER CHARACTER:
        // `runs`, `history`, `runLog`, `genHistory`, `hof` — those are literal
        // claims about runs a given bartender actually played (the compare
        // table's +joe/+pat/+minguk rows and the immortal-count rule both
        // depend on them being honest per-character records, not borrowed).
        //
        // ONE-TIME MIGRATION: seed the shared skill fields from JOE
        // specifically — he is the training character by design (see the
        // roadmap comment above) and has by far the deepest, most-refined
        // data. Guarded by an explicit flag (not `!shared.cem`) so a store
        // where Joe's own cem was legitimately null can't re-trigger this.
        if (!shared.skillShared6127) {
            let seed = null;
            try { seed = JSON.parse(localStorage.getItem(nsKey(CONFIG.learning.storageKey + '_joe'))); } catch (e) { }
            if (!seed || typeof seed !== 'object') seed = (activeChar === 'joe' && d) || {};
            shared.cem = seed.cem || null;
            shared.items = seed.items || {};
            shared.totalPicks = seed.totalPicks || 0;
            shared.builds = seed.builds || {};
            shared.rosters = seed.rosters || {};
            shared.linucb = seed.linucb || {};
            shared.tagucb = seed.tagucb || {};
            shared.rainbowPolicy = seed.rainbowPolicy || {};
            shared.spawnIntel = seed.spawnIntel || {};
            // If the seed itself predates the 6.107.0 ratchet wipe (no flag),
            // its enemyTypeMul/enemyTypeN are exactly the stale ratcheted
            // values that wipe existed to clear — carrying them into the
            // fresh shared store would silently undo that fix. Only adopt
            // them when the seed shows the wipe already ran.
            shared.enemyTypeMul = seed.enemyMulEpoch6107 ? (seed.enemyTypeMul || {}) : {};
            shared.enemyTypeN = seed.enemyMulEpoch6107 ? (seed.enemyTypeN || {}) : {};
            // Either way, the shared store is clean now — mark it done so
            // sanitizeCem's dead wipe branch can never fire again and delete
            // this the first time a character whose OWN store predates
            // 6.107.0 (Pat) loads.
            shared.enemyMulEpoch6107 = 1;
            shared.skillShared6127 = 1;
        }
        d.versions = shared.versions || {};
        d.snapshots = shared.snapshots || [];
        if (shared.lastVersion && !d.lastVersion) d.lastVersion = shared.lastVersion;
        d.bartender = activeChar || 'minguk';
        d.cem = shared.cem || null;       // v6.127.0: SHARED across bartenders — see block above
        d.items = shared.items || {};     // name -> {n, sum}                    (SHARED)
        d.totalPicks = shared.totalPicks || 0;                              // (SHARED)
        d.history = d.history || [];      // recent rewards
        d.runs = d.runs || 0;
        d.builds = shared.builds || {};   // primary cocktail -> {n, sum}        (SHARED)
        d.hof = d.hof || [];              // hall of fame: top-5 runs ever {r, p}
        d.genHistory = d.genHistory || []; // mean batch reward per generation — the improvement curve
        d.runLog = d.runLog || [];        // last 30 runs, for the 📊 stats report
        d.rosters = shared.rosters || {}; // roster id -> {n, sum} (roster experiment bandit)   (SHARED)
        d.versions = d.versions || {};    // script version -> rollup, so versions can be COMPARED
        d.snapshots = d.snapshots || [];  // FROZEN per-version records (survive rollup resets)
        // REWARD EPOCH. computeReward's scale changed in v6.79.0 (the old one
        // saturated at 110 min, so a 252-min run scored BELOW a 115-min one).
        // Rewards from a different epoch are not comparable, so the baselines
        // that are pure reward numbers get cleared. Everything that encodes
        // LEARNING — cem.mean/sigma, item/build/roster/linucb statistics — is
        // kept, because those are still the best parameters we have found.
        if (d.rewardEpoch !== REWARD_EPOCH) {
            d.rewardEpoch = REWARD_EPOCH;
            d.hof = [];            // repopulates within ~5 runs
            d.genHistory = [];     // improvement curve restarts on the new scale
            d.history = [];
            d.lastGradient = null;
        }
        // VERSION CHANGE → FREEZE the outgoing version's rollup. This is what
        // makes "which version was best" answerable after the fact: the
        // record is written the moment a new script first loads, before it
        // can touch anything.
        if (d.lastVersion && d.lastVersion !== scriptTag()) {
            freezeSnapshot(d, d.lastVersion, 'version-change');
        }
        d.lastVersion = scriptTag();
        // BACKFILL (6.81.0): rollups written before the time list existed get
        // their recent times from runLog (last 30 runs carry a version tag),
        // so median / P60 have SOMETHING to work with until fresh runs land.
        for (const k of Object.keys(d.versions)) {
            const v = d.versions[k];
            if (!v || Array.isArray(v.times)) continue;
            const ts = (d.runLog || []).filter(e => e && e.v === k && isFinite(e.t)).map(e => Math.round(e.t));
            v.times = ts;
            v.timesPartial = ts.length < v.n;   // flagged: median covers the tail, not the whole history
        }
        // SEED: the crown-winning release predates per-version tracking, so
        // its row is entered by hand — best time read off the game's own hell
        // board (the crown run IS the board's #1), everything else unknown.
        if (!d.snapshots.some(s => s.version === '6.74.0')) {
            let crown = null;
            try {
                const b = JSON.parse(localStorage.getItem('paco_bdh_time') || '[]');
                crown = b.map(e => +e.time).filter(t => isFinite(t) && t > 0).sort((x, y) => y - x)[0] || null;
            } catch (e) { }
            d.snapshots.unshift({
                version: '6.74.0', frozenAtRun: d.runs, reason: 'seeded', frozenAt: new Date().toISOString(),
                runs: null, meanTimeS: null, bestTimeS: crown, meanReward: null, rewardEpoch: 1,
                hellRate: null, dayClearRate: null, supersPerRun: null, deaths: {}, top: [],
                note: 'CROWN WINNER (user-confirmed). Pre-dates per-version tracking; bestTimeS = hell board #1 at seed time.'
            });
        }
        d.linucb = shared.linucb || {};        // card name -> diagonal LinUCB model {n, A[d], b[d]}       (SHARED, v6.127.0)
        d.tagucb = shared.tagucb || {};        // v6.107.0: attack-type tag -> the same model               (SHARED, v6.127.0)
        d.rainbowPolicy = shared.rainbowPolicy || {};   // 'take' | 'skip' -> {n, sum} (crown-path bandit)   (SHARED, v6.127.0)
        d.spawnIntel = shared.spawnIntel || {};         // enemy class -> {n, sum} first-seen gameTime      (SHARED, v6.127.0)
        d.enemyTypeMul = shared.enemyTypeMul || {};     // enemy class -> learned damage multiplier         (SHARED, v6.127.0)
        d.enemyTypeN = shared.enemyTypeN || {};         // enemy class -> sample count backing the above    (SHARED, v6.127.0)
        // v6.127.0: this flag now guards SHARED enemyTypeMul/enemyTypeN, so it
        // must track `shared`, not whatever this character's own (possibly
        // decades-stale) store happens to carry — otherwise a character whose
        // own store predates 6.107.0 (Pat) would re-trigger sanitizeCem's
        // dead one-time wipe and silently erase the shared table.
        if (shared.enemyMulEpoch6107) d.enemyMulEpoch6107 = 1;
        // Bartender priors. The hell crown board is the strongest evidence we
        // have: 9 of the top 10 (including the 126-min #1) played PAT — his
        // 180 HP + splash survive deep hell. Seed PAT above JOE; real results
        // take over from there.
        if (!d.items['SHAKING']) d.items['SHAKING'] = { n: 1, sum: 0.7 };
        if (!d.items['STIRRING']) d.items['STIRRING'] = { n: 1, sum: 0.55 };
        // migrate older tuning formats (v5.0 single-point, v5.2 population)
        // into the CEM distribution, seeded from the best params found so far
        if (!d.cem || !d.cem.mean) {
            let seed = DEFAULT_PARAMS;
            if (Array.isArray(d.pop) && d.pop.length) {
                let best = null;
                for (const s of d.pop) if (s.n > 0 && (!best || s.sum / s.n > best.sum / best.n)) best = s;
                if (best) seed = best.params;
            } else if (d.tuning && d.tuning.best) seed = d.tuning.best;
            const mean = {}, sigma = {};
            for (const k of Object.keys(TUNABLE)) {
                const spec = TUNABLE[k];
                mean[k] = Math.min(spec.max, Math.max(spec.min, seed[k] ?? DEFAULT_PARAMS[k]));
                sigma[k] = (spec.max - spec.min) * CONFIG.learning.sigmaInit;
            }
            d.cem = { mean, sigma, batch: [], gen: 0 };
            delete d.pop;
            delete d.tuning;
        }
        // CRITICAL: backfill parameters added in NEWER versions. A stored CEM
        // from an older script lacks entries for new TUNABLE keys; sampling
        // those would produce NaN, silently poisoning every strategy weight
        // and making level-up picks effectively random.
        // CMA-ES-lite state: evolution path + adaptive step size (backfilled
        // for stores written by pre-CMA versions).
        if (!d.cem.pc || typeof d.cem.pc !== 'object') d.cem.pc = {};
        if (!isFinite(d.cem.ss)) d.cem.ss = 1;
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k];
            const range = spec.max - spec.min;
            if (!isFinite(d.cem.mean[k])) d.cem.mean[k] = DEFAULT_PARAMS[k];
            // v6.93.0: CLAMP THE STORED MEAN INTO THE CURRENT BOX. Only sigma
            // was re-floored here, so narrowing a bound had no effect on a
            // live store — the mean stayed outside it and every sample was
            // drawn around an out-of-range centre. That is why the gen-36
            // runaway (six dims pinned at their maxima) survived every
            // version bump. Widening still behaves exactly as before.
            d.cem.mean[k] = Math.min(spec.max, Math.max(spec.min, d.cem.mean[k]));
            if (!isFinite(d.cem.pc[k])) d.cem.pc[k] = 0;
            if (!isFinite(d.cem.sigma[k])) d.cem.sigma[k] = range * CONFIG.learning.sigmaInit;
            // When bounds widen between versions, old converged sigmas are too
            // tight to explore the newly opened territory — re-floor them
            // against the CURRENT range so the learner can walk into it.
            if (d.cem.sigma[k] < range * CONFIG.learning.sigmaFloor)
                d.cem.sigma[k] = range * CONFIG.learning.sigmaFloor;
        }
        // ── v6.111.0 BOX-CHANGE RE-OPEN ─────────────────────────────────────
        //
        // The re-floor immediately above has claimed since v6.93.0 to let the
        // learner "walk into" newly opened territory. It cannot. It raises a
        // converged sigma to `range * sigmaFloor` — and sigmaFloor IS the
        // converged state, by definition. Widening a box moved the wall and
        // left the search still welded to the old corner.
        //
        // That mattered this version more than any other. `threat.lineWeight`
        // sat at its box minimum and `movement.hellCautionMul` at its box
        // maximum, both `converged`, and BOTH BOXES ARE WIDENED IN THIS
        // BUILD. Without this block, widening them would have been a no-op:
        // the mean would stay exactly where it is, sigma would stay at 5% of
        // range, and 1250 runs of evidence would have bought a config diff
        // and no behaviour change at all.
        //
        // So: remember the box each dimension was last TRAINED under, and
        // when the current box differs, re-open that dimension — sigma back
        // to sigmaInit against the new range, evolution path cleared. This is
        // deliberately SURGICAL. A restart reopens all 28 dims and throws
        // away tuning that took hundreds of generations to earn; a recenter
        // also discards the mean. Only the dims whose box actually moved pay
        // anything, and even they keep their mean — the search resumes from
        // what it learned, with room to leave.
        //
        // The mean is left alone on purpose. A mean at a bound is evidence
        // about DIRECTION: the search spent generations pushing that way and
        // ran out of room. Re-centring it would discard exactly that signal.
        if (!d.cem.box || typeof d.cem.box !== 'object') d.cem.box = {};
        const reopened = [];
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k];
            const range = spec.max - spec.min;
            // A store written before this block has no box record at all. For
            // the dims this build widened, TUNABLE_PRIOR supplies the box they
            // were actually trained under, so the migration fires once; every
            // other dim seeds from its current box and is a no-op. Without
            // this, the upgrade that widens a box is the one load on which the
            // widening cannot be detected.
            if (d.cem.box[k] == null && TUNABLE_PRIOR[k]) d.cem.box[k] = TUNABLE_PRIOR[k];
            const was = d.cem.box[k];
            // A key with no recorded box is either brand new (already seeded
            // at sigmaInit above) or predates this block. Record and move on
            // — re-opening every dim on the upgrade to 6.111.0 would be a
            // silent full restart, which is precisely what this avoids.
            if (was && isFinite(was.min) && isFinite(was.max) &&
                (was.min !== spec.min || was.max !== spec.max) && range > 0) {
                d.cem.sigma[k] = range * CONFIG.learning.sigmaInit;
                d.cem.pc[k] = 0;
                reopened.push(k + ' [' + was.min + ',' + was.max + ']->[' + spec.min + ',' + spec.max + ']');
            }
            d.cem.box[k] = { min: spec.min, max: spec.max };
        }
        if (reopened.length) {
            // Clearing the step size and the stale batch matters as much as
            // the sigmas: `ss` and a half-filled batch both carry the old
            // geometry, and maybeRestart's stall counter would otherwise read
            // the re-opened generation as a failure to improve.
            d.cem.ss = 1;
            d.cem.batch = [];
            delete d.cem.prevBatchMean;
            d.cem.stall = 0;
            d.cem.bestBatchMean = null;
            d.cem.reopens = (d.cem.reopens || 0) + 1;
            // Recorded rather than only logged. `loadLearn` is called from
            // part 01 BEFORE `const log` is initialised, so calling the logger
            // here throws a TDZ ReferenceError and takes the whole boot with
            // it — which is exactly what the first build of this block did to
            // all 82 scenarios. (The pre-existing `log` in the catch above has
            // the same latent fault; it has simply never fired.) The console
            // line is best-effort; `lastReopen` is the durable record, and
            // `pineBot.learning()` reports it.
            d.cem.lastReopen = { runs: d.runs || 0, dims: reopened.slice() };
            try {
                log('CEM BOX RE-OPEN — ' + reopened.length + ' dim(s) widened, sigma back to ' +
                    Math.round(CONFIG.learning.sigmaInit * 100) + '% of the NEW range: ' + reopened.join('; '));
            } catch (e) { /* logger not initialised yet — lastReopen carries it */ }
        }
        return d;
    }
    function saveLearn() {
        // v6.88.0 AUDIT R1. Three defects in five lines. (1) The SHARED blob was
        // written first, so a quota throw skipped the per-bartender store —
        // the CEM mean/sigma, hall of fame, item and build stats — entirely.
        // (2) The catch was empty, so that happened silently: learn.runs stops
        // advancing, the CEM stops refitting across reloads, and nothing says
        // so. (3) learn.versions grows a permanent ~3.7 KB entry per
        // version x profile x bartender and was never pruned, which is what
        // eventually causes the throw. Now: own store first (it is the one
        // that must survive), versions pruned like snapshots already were, and
        // a failure is logged and surfaced once.
        // v6.127.0: cem/items/totalPicks/builds/rosters/linucb/tagucb/
        // rainbowPolicy/spawnIntel/enemyTypeMul/enemyTypeN are SHARED now
        // (see loadLearnInner) — they belong in the SHARED_KEY blob below,
        // not duplicated into every bartender's own store.
        const own = (() => {
            const { versions, snapshots, cem, items, totalPicks, builds, rosters,
                linucb, tagucb, rainbowPolicy, spawnIntel, enemyTypeMul, enemyTypeN, ...rest } = learn;
            return rest;
        })();
        let ok = true, ownSaved = false;
        let ownBlob = JSON.stringify(own);
        try { localStorage.setItem(learnKey(), ownBlob); ownSaved = true; }
        catch (e) {
            // v6.96.2 QUOTA PATH: a full origin used to cost the whole run's
            // learning ("learning for this run is lost"). The store's own
            // bulk is almost entirely rings that exist for REPORTING —
            // runLog, reward history, the improvement curve — so trim those
            // hard and retry once before conceding. The CEM mean/sigma and
            // the item/build statistics, the parts that ARE the learning,
            // are a few KB and always fit.
            try {
                own.runLog = (own.runLog || []).slice(-10);
                own.history = (own.history || []).slice(-40);
                own.genHistory = (own.genHistory || []).slice(-40);
                own.hof = (own.hof || []).slice(0, 5);
                ownBlob = JSON.stringify(own);
                localStorage.setItem(learnKey(), ownBlob);
                ownSaved = true;
                log('SAVE squeezed: own store trimmed to ' + ownBlob.length + ' bytes to fit quota');
            } catch (e2) { ok = false; log('SAVE FAILED (own store): ' + (e2 && e2.name) + ' — learning for this run is lost'); }
        }
        // v6.96.2: the backup only ever holds a blob the primary ACCEPTED, so
        // a crash mid-save leaves the backup one save old, never corrupt-both.
        if (ownSaved) { try { localStorage.setItem(learnKey('__bak'), ownBlob); } catch (e) { } }
        try {
            pruneVersions();
            localStorage.setItem(SHARED_KEY, JSON.stringify({
                versions: learn.versions || {}, snapshots: learn.snapshots || [], lastVersion: learn.lastVersion,
                skillShared6127: 1,
                cem: learn.cem || null, items: learn.items || {}, totalPicks: learn.totalPicks || 0,
                builds: learn.builds || {}, rosters: learn.rosters || {}, linucb: learn.linucb || {},
                tagucb: learn.tagucb || {}, rainbowPolicy: learn.rainbowPolicy || {},
                spawnIntel: learn.spawnIntel || {}, enemyTypeMul: learn.enemyTypeMul || {}, enemyTypeN: learn.enemyTypeN || {}
            }));
        } catch (e) {
            // v6.96.2 QUOTA PATH (shared): the bulk is the per-version
            // survival-time rings (up to 600 entries each). Trim every row
            // but the live one to its last 40 times — enough for a median —
            // and retry once.
            try {
                const cur = scriptTag();
                for (const [k, v] of Object.entries(learn.versions || {})) {
                    if (k !== cur && v && Array.isArray(v.times) && v.times.length > 40) v.times = v.times.slice(-40);
                }
                localStorage.setItem(SHARED_KEY, JSON.stringify({
                    versions: learn.versions || {}, snapshots: learn.snapshots || [], lastVersion: learn.lastVersion,
                    skillShared6127: 1,
                    cem: learn.cem || null, items: learn.items || {}, totalPicks: learn.totalPicks || 0,
                    builds: learn.builds || {}, rosters: learn.rosters || {}, linucb: learn.linucb || {},
                    tagucb: learn.tagucb || {}, rainbowPolicy: learn.rainbowPolicy || {},
                    spawnIntel: learn.spawnIntel || {}, enemyTypeMul: learn.enemyTypeMul || {}, enemyTypeN: learn.enemyTypeN || {}
                }));
                log('SAVE squeezed: shared time rings trimmed to fit quota');
            } catch (e2) {
                log('SAVE FAILED (shared table): ' + (e2 && e2.name) + ' — comparison history is not being recorded');
                ok = false;
            }
        }
        if (!ok && !saveWarned) { saveWarned = true; try { setStatus('⚠ localStorage full — learning is NOT being saved'); } catch (e2) { } }
        return ok;
    }

    // v6.88.0 AUDIT R1: keep the shared comparison table bounded. Rows are kept
    // by run count (the ones that carry evidence), never below the most recent
    // versionKeep tags, so an active version is never dropped mid-measurement.
    function pruneVersions() {
        const V = learn.versions || {};
        const keys = Object.keys(V);
        const cap = CONFIG.learning.versionKeep || 40;
        if (keys.length <= cap) return;
        const recent = new Set(keys.slice(-8));
        recent.add(scriptTag());
        const ranked = keys.filter(k => !recent.has(k))
            .sort((a, b) => (V[b].n || 0) - (V[a].n || 0))
            .slice(0, Math.max(0, cap - recent.size));
        const keep = new Set([...recent, ...ranked]);
        let dropped = 0;
        for (const k of keys) if (!keep.has(k)) { delete V[k]; dropped++; }
        if (dropped) log('pruned ' + dropped + ' low-evidence version row(s) from the shared table');
    }
    function resetLearn() {
        // Snapshots are the historical record — freeze the live version
        // first, then preserve every snapshot across the reset.
        let keep = [];
        try {
            freezeSnapshot(learn, scriptTag(), 'pre-reset');
            keep = (learn.snapshots || []).slice();
        } catch (e) { }
        try { localStorage.removeItem(learnKey()); } catch (e) { }   // this bartender only; shared history untouched
        learn = loadLearn();
        if (keep.length) { learn.snapshots = keep; saveLearn(); }
        applyParams(DEFAULT_PARAMS);
        setStatus('learning reset for ' + (activeChar || 'minguk') + ' (other bartenders + version snapshots kept)');
    }

    // ---- VERSION COMPARISON ------------------------------------------
    // One row per version: live rollups (still accumulating) merged over
    // frozen snapshots (a frozen record wins only if the live one is gone).
    // Ordered by release so each row carries deltas vs the row before it.
    function versionRows() {
        const rows = {};
        for (const s of (learn.snapshots || [])) rows[s.version] = { ...s, status: 'frozen' };
        const V = learn.versions || {};
        for (const k of Object.keys(V)) {
            const v = V[k];
            if (!v || !v.n) continue;
            rows[k] = {
                version: k, status: 'live', runs: v.n,
                meanTimeS: Math.round(v.sumT / v.n), bestTimeS: Math.round(v.bestT),
                meanDowns: Math.round((v.sumD || 0) / v.n), meanSales: Math.round((v.sumS || 0) / v.n),
                meanReward: +(v.sumR / v.n).toFixed(3), rewardEpoch: v.epoch,
                hellRate: +(v.hell / v.n).toFixed(2), dayClearRate: +(v.day / v.n).toFixed(2),
                supersPerRun: +(v.sumSupers / v.n).toFixed(1),
                deaths: v.deaths || {}, top: (v.top || []).slice(), runRange: [v.firstRun, v.lastRun],
                note: rows[k] && rows[k].note,
                ...rollupStats(v)
            };
        }
        const semver = s => String(s).split('+')[0].split('.').map(n => +n || 0);
        const cmp = (a, b) => {
            const x = semver(a.version), y = semver(b.version);
            for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
            return String(a.version).localeCompare(String(b.version));
        };
        // v6.88.0 AUDIT C2. Every guard here used the GLOBAL isFinite, and
        // `isFinite(null) === true` — so every unknown field passed as 0.
        //   * the hand-seeded 6.74.0 row carries meanTimeS: null, so the next
        //     row reported invented deltas against a version with no mean;
        //   * a row with ONE run has seTimeS === null (rollupStats leaves sd
        //     null at n=1), which entered the Welch denominator as zero.
        // That is exactly how 6.85.18+crown+pat came to read n=1, z=+8.66,
        // "better" — immediately before its successor read z=-32.43 at n=57.
        // Number.isFinite rejects null. A verdict also now requires 2+ runs on
        // BOTH sides, and rows under the significance floor say so out loud.
        const fin = Number.isFinite;
        const MIN_VERDICT_RUNS = 2;
        const out = Object.values(rows).sort(cmp);
        let prev = null;
        for (const r of out) {
            if (r.runs < CONFIG.learning.minMeaningfulRuns) r.underpowered = true;
            if (prev && fin(r.meanTimeS) && fin(prev.meanTimeS)) {
                // z-score of the mean-time gap (Welch). |z| < 2 = still noise.
                let z = null;
                if (fin(r.seTimeS) && fin(prev.seTimeS) && (r.seTimeS || prev.seTimeS) &&
                    r.runs >= MIN_VERDICT_RUNS && prev.runs >= MIN_VERDICT_RUNS)
                    z = +((r.meanTimeS - prev.meanTimeS) / Math.sqrt(r.seTimeS * r.seTimeS + prev.seTimeS * prev.seTimeS)).toFixed(2);
                r.vsPrev = {
                    version: prev.version,
                    meanTimeS: r.meanTimeS - prev.meanTimeS,
                    medianTimeS: (fin(r.medianTimeS) && fin(prev.medianTimeS)) ? r.medianTimeS - prev.medianTimeS : null,
                    bestTimeS: (fin(r.bestTimeS) && fin(prev.bestTimeS)) ? r.bestTimeS - prev.bestTimeS : null,
                    hellRate: (fin(r.hellRate) && fin(prev.hellRate)) ? +(r.hellRate - prev.hellRate).toFixed(2) : null,
                    p60: (fin(r.p60) && fin(prev.p60)) ? +(r.p60 - prev.p60).toFixed(2) : null,
                    z, verdict: z == null ? 'insufficient data'
                        // v6.88.2: name WHICH side is thin. The old label said
                        // "n<20" on rows with n=47 because the row they were
                        // being compared against was the underpowered one, so
                        // the table reported a well-supported row as weak.
                        : (r.underpowered || prev.underpowered)
                            ? 'UNDERPOWERED (' +
                              (r.underpowered && prev.underpowered
                                  ? 'both rows, n=' + r.runs + ' vs ' + prev.runs
                                  : r.underpowered
                                      ? 'this row, n=' + r.runs
                                      : 'BASELINE ' + prev.version + ', n=' + prev.runs) +
                              ' < ' + CONFIG.learning.minMeaningfulRuns + ') — z is not evidence'
                            : (Math.abs(z) < 2 ? 'noise (|z|<2)' : (z > 0 ? 'better (z>=2)' : 'worse (z<=-2)'))
                };
            }
            // only a row with a REAL mean becomes the comparison baseline
            if (fin(r.meanTimeS) && r.runs >= MIN_VERDICT_RUNS) prev = r;
        }
        return out;
    }
    function versionComparison() {
        const rows = versionRows();
        // v6.122.0: Number.isFinite, not the global. versionRows switched
        // away for exactly this reason and these three were missed — global
        // isFinite(null) is TRUE, so a legacy row with p60 === null won
        // `bestDeepRunRate` over a 200-run row whose p60 was a measured 0,
        // while `howToRead` calls that field the floored, trustworthy one.
        const withData = rows.filter(r => Number.isFinite(r.bestTimeS));
        const bestByTime = withData.slice().sort((a, b) => b.bestTimeS - a.bestTimeS)[0] || null;
        // v6.91.7 `bestAverage` HAD NO SAMPLE FLOOR, and the mean is the noisiest
        // of the three headline fields. Live case: 6.91.2 at n=4 was promoted as
        // best-average on meanTimeS 4236 — one 14805s run against 1282 / 592 /
        // 264, sd 7059. Its own medianTimeS in the same block reads 937, the
        // WORST of any recent row. `bestDeepRunRate` already floored at 20 and
        // correctly kept pointing at 6.89.10 (n=133).
        //
        // A headline that a single lucky run can capture is a lottery, which is
        // exactly what `howToRead` warns about for bestPeak — and the warning did
        // not cover the field that needed it most. Both floored on the same
        // constant now, so there is one threshold rather than a hardcoded 20
        // beside an unguarded sort.
        const floorN = CONFIG.learning.minMeaningfulRuns;
        const bestByMean = withData.filter(r => Number.isFinite(r.meanTimeS) && r.runs >= floorN)
            .sort((a, b) => b.meanTimeS - a.meanTimeS)[0] || null;
        const bestByP60 = withData.filter(r => Number.isFinite(r.p60) && r.runs >= floorN)
            .sort((a, b) => b.p60 - a.p60)[0] || null;
        const epochs = new Set(rows.map(r => r.rewardEpoch).filter(e => e != null));
        return {
            note: epochs.size > 1
                ? 'meanReward spans MULTIPLE reward epochs — compare meanTimeS/bestTimeS instead'
                : 'single reward epoch — all fields comparable',
            current: scriptTag(),
            bestPeak: bestByTime ? { version: bestByTime.version, bestTimeS: bestByTime.bestTimeS } : null,
            bestAverage: bestByMean ? { version: bestByMean.version, meanTimeS: bestByMean.meanTimeS, medianTimeS: bestByMean.medianTimeS, runs: bestByMean.runs } : null,
            bestDeepRunRate: bestByP60 ? { version: bestByP60.version, p60: bestByP60.p60, p120: bestByP60.p120, runs: bestByP60.runs } : null,
            howToRead: 'bestPeak is a lottery that grows with run count and has NO sample floor — one lucky run owns it. bestAverage and bestDeepRunRate are floored at ' + floorN + ' runs. Judge versions on medianTimeS / p60 / p120 and the vsPrev z-score.',
            versions: rows
        };
    }
    // Back-compat alias (older console habits): same table, time-sorted.
    function versionReport() {
        const c = versionComparison();
        return { note: c.note, versions: c.versions.slice().sort((a, b) => (b.bestTimeS || 0) - (a.bestTimeS || 0)) };
    }
    // Manual snapshot: freeze the running version NOW (e.g. before editing
    // the script), and hand-annotate any version's row.
    function snapshotNow(reason) {
        learn = loadLearn();
        const ok = freezeSnapshot(learn, scriptTag(), reason || 'manual');
        saveLearn();
        setStatus(ok ? '📸 snapshot saved: ' + scriptTag() : '📸 nothing to snapshot yet (no runs on ' + scriptTag() + ')');
        return ok;
    }
    function noteVersion(tag, patch) {
        learn = loadLearn();
        learn.snapshots = learn.snapshots || [];
        let s = learn.snapshots.find(x => x.version === tag);
        if (!s) { s = { version: tag, reason: 'manual', frozenAt: new Date().toISOString(), deaths: {}, top: [] }; learn.snapshots.push(s); }
        Object.assign(s, patch || {});
        saveLearn();
        return s;
    }

    function itemStat(name) {
        const s = learn.items[name];
        if (!s || !s.n) return null;
        return { n: s.n, mean: s.sum / s.n };
    }
    function ucbScore(name) {
        const s = itemStat(name);
        const total = Math.max(1, learn.totalPicks);
        if (!s) return CONFIG.learning.c * Math.sqrt(Math.log(total + 1)) * 0.5; // optimistic for unseen
        return s.mean * 10 + CONFIG.learning.c * Math.sqrt(Math.log(total + 1) / s.n);
    }
    function creditItems(reward) {
        const total = Math.max(1, runPicks.length);
        for (const name of Object.keys(runPickCounts)) {
            let weight = Math.min(1, runPickCounts[name] / 3);
            // Early picks shape the whole run — credit them ~1.5x vs late picks.
            const firstIdx = runPicks.indexOf(name);
            if (firstIdx >= 0) weight *= 1.5 - 0.5 * (firstIdx / total);
            const s = learn.items[name] || { n: 0, sum: 0 };
            s.n = s.n * CONFIG.learning.decay + weight;
            s.sum = s.sum * CONFIG.learning.decay + reward * weight;
            learn.items[name] = s;
            learn.totalPicks++;
        }
    }

    function baseline() {
        const h = learn.history;
        if (!h.length) return null;
        const w = h.slice(-CONFIG.learning.baselineWindow);
        return w.reduce((a, b) => a + b, 0) / w.length;
    }

    // ---- CEM (Cross-Entropy Method) optimizer ------------------------
    // Every run samples parameters from a per-parameter Gaussian. Runs are
    // collected into a batch (shared across tabs); when the batch is full,
    // the distribution is refit toward the TOP-RANKED runs and exploration
    // shrinks. Rank-based elite selection is what makes this robust: a
    // freak lucky run can only ever be one elite among several, whereas the
    // old mean-comparison optimizers let single outliers steer everything.
    function bestParams() { return learn.cem ? learn.cem.mean : DEFAULT_PARAMS; }

    // v6.85.23: sanitize the CEM state. 6.85.22 added TUNABLE keys with no
    // stored mean/sigma, so 273 runs sampled NaN for them; the NaN entries
    // rode into batch/hof vectors and the step-size update, freezing
    // exploration. Strip every non-finite value and reset ss if poisoned.
    function sanitizeCem() {
        try {
            const c = learn && learn.cem;
            if (!c) return;
            const bad = v => !(typeof v === 'number' && isFinite(v));   // null survives JSON and passes isFinite!
            for (const tbl of [c.mean, c.sigma, c.pc]) {
                if (!tbl) continue;
                for (const k of Object.keys(tbl)) if (bad(tbl[k])) delete tbl[k];
            }
            if (bad(c.ss)) c.ss = 1;
            // v6.86.0: means drift outside their box when a TUNABLE bound is
            // tightened (deepFocusLv 6 -> 4 this version). Clamp, don't drop.
            for (const k of Object.keys(TUNABLE)) {
                const spec = TUNABLE[k];
                if (isFinite(c.mean[k])) c.mean[k] = Math.min(spec.max, Math.max(spec.min, c.mean[k]));
            }
            // legacy hof entries predate mean-tracking: give them one observation
            if (Array.isArray(learn.hof)) for (const h of learn.hof) {
                if (!isFinite(h.n)) { h.n = 1; h.sum = h.r; h.best = h.r; }
            }
            const clean = arr => Array.isArray(arr) ? arr.map(e => {
                if (e && e.p) for (const k of Object.keys(e.p)) if (bad(e.p[k])) delete e.p[k];
                return e;
            }) : arr;
            c.batch = clean(c.batch);
            learn.hof = clean(learn.hof);
            // v6.85.23: the 6.85.22 enemy-type multipliers stopped being
            // applied, and stored ratcheted values must not linger in case a
            // future version applies them again. Cleared once here.
            // v6.107.0: that future version is this one, and the wipe now runs
            // EXACTLY ONCE per store instead of every trial. Deleting it every
            // trial made the table permanently unlearnable — 04-lifecycle
            // wrote it at the end of every run and this erased it before the
            // next, so it has been dead state for twenty-odd versions.
            // The one-time wipe still matters: a store may hold values
            // ratcheted to the 2.2 cap by the old nearest-type attribution,
            // and those must not survive into a version that APPLIES them.
            // The counts start empty too, so nothing is applied until
            // `enemyMulMinN` fresh sole-candidate events exist per type.
            if (!learn.enemyMulEpoch6107) {
                learn.enemyMulEpoch6107 = 1;
                if (learn.enemyTypeMul) delete learn.enemyTypeMul;
                if (learn.enemyTypeN) delete learn.enemyTypeN;
            }
        } catch (e) { }
    }

    // v6.86.0 RESTART. Even with a deduped hof a CEM can converge into a bad
    // basin: sigma anneals to the floor, the mean welds in place, and every
    // later run is a +/-5% jitter around a policy that is merely locally best.
    // The measured store had all 24 sigmas at the floor with a flat median
    // across its last 600 runs. When exploration is dead AND the batch mean
    // has stopped improving, re-open the search (standard CMA restart): wide
    // sigma again, step size reset, path cleared, hof pruned to its best
    // entry so the next generation cannot be re-anchored by the same point.
    // The mean is KEPT — this re-explores around the current best guess, it
    // does not throw the tuning away.
    function sigmasAtFloor() {
        const c = learn.cem, keys = Object.keys(TUNABLE);
        let atFloor = 0, n = 0;
        for (const k of keys) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            if (!isFinite(c.sigma[k]) || range <= 0) continue;
            n++;
            if (c.sigma[k] <= range * CONFIG.learning.sigmaFloor * 1.02) atFloor++;
        }
        return n ? atFloor / n : 0;
    }
    function restartSearch(why) {
        const c = learn.cem;
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k];
            c.sigma[k] = (spec.max - spec.min) * CONFIG.learning.restartSigma;
        }
        c.ss = 1; c.pc = {}; c.batch = [];
        delete c.prevBatchMean;
        c.stall = 0;
        // v6.88.0 AUDIT D6: bestBatchMean is an ALL-TIME high-water mark and was
        // never reset here. Rewards are outlier-dominated by design (one
        // 250-minute run scores ~4.2 against a typical ~1.0), so a single deep
        // run pinned it permanently — after which maybeRestart saw every later
        // generation as not-improving, the stall counter climbed to the limit
        // unconditionally, and restartSearch fired on a permanent cycle,
        // pruning the hall of fame to one entry each time. Clearing it makes
        // "improvement" mean improvement since the restart, which is the only
        // thing the stall counter can sensibly measure.
        c.bestBatchMean = null;
        c.restarts = (c.restarts || 0) + 1;
        c.lastRestartRun = learn.runs;
        // keep only the single best entry: three near-identical elites are how
        // the search died in the first place
        learn.hof = learn.hof.slice(0, 1);
        log('CEM RESTART (' + why + ') — sigma reopened to ' + Math.round(CONFIG.learning.restartSigma * 100) +
            '% of range, hof pruned to best, restart #' + c.restarts);
        saveLearn();
        return { restarts: c.restarts, why: why, gen: c.gen, runs: learn.runs };
    }
    // v6.98.0 RECENTER — the repair restartSearch cannot perform. A restart
    // reopens SIGMA but keeps the MEAN, so a mean the deathNudge ratchet
    // dragged to the box corner stays in the corner and the reopened search
    // converges straight back onto it (measured: gen 106, four contact-pool
    // params exactly at box max, dayClear 0.01 over 865 runs). Recentering
    // puts the mean back on the CONFIG defaults — the basin that organically
    // climbed 0.03 -> 0.14 before any seeding — reopens sigma to sigmaInit,
    // and clears the hall of fame outright: champion vectors recorded during
    // the pinned era carry the corner inside them, and replaying one would
    // re-inject it. Item/build/roster statistics and the run log are kept.
    function recenterSearch(why) {
        const c = learn.cem;
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k];
            c.mean[k] = Math.min(spec.max, Math.max(spec.min,
                DEFAULT_PARAMS[k] != null ? DEFAULT_PARAMS[k] : (spec.min + spec.max) / 2));
            c.sigma[k] = (spec.max - spec.min) * CONFIG.learning.sigmaInit;
        }
        c.ss = 1; c.pc = {}; c.batch = []; c.gen = 0;
        delete c.prevBatchMean;
        c.stall = 0;
        c.bestBatchMean = null;
        c.recenters = (c.recenters || 0) + 1;
        learn.hof = [];
        log('CEM RECENTER (' + why + ') — mean back to config defaults, sigma to ' +
            Math.round(CONFIG.learning.sigmaInit * 100) + '% of range, hof cleared, recenter #' + c.recenters);
        saveLearn();
        return { recenters: c.recenters, why: why, runs: learn.runs };
    }

    function maybeRestart(batchMean) {
        const c = learn.cem, L = CONFIG.learning;
        if (!L.autoRestart) return;
        const dead = sigmasAtFloor() >= 0.8;
        const improved = !isFinite(c.bestBatchMean) || batchMean > c.bestBatchMean + 1e-6;
        if (improved) c.bestBatchMean = batchMean;
        // a generation only counts as stalled when exploration is dead AND it
        // failed to beat the best batch this search has produced
        c.stall = (dead && !improved) ? (c.stall || 0) + 1 : 0;
        if (c.stall >= L.restartAfterStalledGens) restartSearch('stalled ' + c.stall + ' generations at the sigma floor');
    }

    function gauss() {
        let u = 0, v = 0;
        while (!u) u = Math.random();
        while (!v) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    function sampleParams() {
        // CMA-ES-lite sampling: diagonal Gaussian PLUS a rank-1 component
        // along the evolution path pc (the direction the mean has been
        // moving, in sigma units) — so correlated parameter moves that
        // worked keep being explored TOGETHER — all scaled by the adaptive
        // global step size ss.
        const c = learn.cem, out = {};
        const ss = isFinite(c.ss) ? c.ss : 1;
        const r1 = gauss();   // one shared draw drives the correlated component
        for (const k of Object.keys(TUNABLE)) {
            const s = TUNABLE[k];
            const pc = (c.pc && isFinite(c.pc[k])) ? c.pc[k] : 0;
            const step = ss * (gauss() * c.sigma[k] + 0.35 * r1 * pc * c.sigma[k]);
            out[k] = Math.min(s.max, Math.max(s.min, c.mean[k] + step));
        }
        return out;
    }

    function beginTrial() {
        // MULTI-TAB: re-read shared storage to pick up other tabs' progress
        // before this run counts itself in.
        learn = loadLearn();
        sanitizeCem();   // v6.85.23: purge NaN-poisoned CEM state + stale enemyTypeMul every trial
        repairCollapsedStore();   // v6.86.0: reopen a store that arrived already locked at the sigma floor
        learn.runs++;
        if (learn.runs <= CONFIG.learning.tuningWarmupRuns) {
            championRun = false;
            trialParams = { ...learn.cem.mean };        // warmup: play the current best estimate
        } else if (learn.runs % 4 === 0 && learn.hof.length) {
            // CHAMPION RUN: replay the all-time-best parameters exactly —
            // the best shot at a record, and a fresh audit of the champion.
            championRun = true;
            trialParams = { ...learn.hof[0].p };
        } else {
            championRun = false;
            trialParams = sampleParams();
        }
        applyParams(trialParams);
        saveLearn();
    }
    // v6.86.0 ONE-TIME REPAIR: a store that arrives already collapsed (every
    // sigma at the floor, duplicate hof entries) would otherwise need ~40
    // stalled generations before the auto-restart notices. Detect it once per
    // store on first load and reopen the search immediately.
    function repairCollapsedStore() {
        try {
            const c = learn && learn.cem;
            if (!c || !c.mean || c.repaired6860) return;
            c.repaired6860 = true;
            const dupes = (() => {
                let d = 0;
                for (let i = 0; i < learn.hof.length; i++)
                    for (let j = i + 1; j < learn.hof.length; j++)
                        if (paramDist(learn.hof[i].p, learn.hof[j].p) < CONFIG.learning.hofMergeDist) d++;
                return d;
            })();
            // always collapse duplicate hof entries into one (merging their
            // observations); the clones are what welded the refit in place
            if (dupes) {
                const kept = [];
                for (const h of learn.hof) {
                    const twin = kept.find(x => paramDist(x.p, h.p) < CONFIG.learning.hofMergeDist);
                    if (twin) {
                        twin.n = (twin.n || 1) + (h.n || 1);
                        twin.sum = (isFinite(twin.sum) ? twin.sum : twin.r) + (isFinite(h.sum) ? h.sum : h.r);
                        twin.r = +(twin.sum / twin.n).toFixed(4);
                        twin.best = Math.max(twin.best || twin.r, h.best || h.r);
                    } else kept.push(h);
                }
                learn.hof = kept;
                log('hof deduped: ' + dupes + ' duplicate pair(s) merged -> ' + kept.length + ' distinct vectors');
            }
            if (sigmasAtFloor() >= 0.8) restartSearch('collapsed store on load (' + dupes + ' duplicate hof entries)');
            else saveLearn();
        } catch (e) { }
    }
    // v6.86.0 HALL-OF-FAME REPAIR. Measured failure (6.85.23, n=3373): the
    // hof held FOUR distinct vectors in five slots because every 4th run
    // replays hof[0] and, scoring above the 5th slot, re-inserted its own
    // clone. refitCem takes hof.slice(0,3) as three of its five elites, so a
    // duplicated champion owned 60% of the refit; elite sd went to ~0 and all
    // 24 sigmas pinned to the floor. The search stopped searching at gen 425.
    // Two changes fix it structurally:
    //   1. entries are UNIQUE vectors (a near-duplicate merges instead of
    //      pushing), so three hof elites are always three real points;
    //   2. an entry scores on the MEAN of every run that played it, not on
    //      the single lucky draw that created it. A champion replay now
    //      RE-ESTIMATES the champion; a fluke demotes itself over a few
    //      replays instead of anchoring the refit forever.
    function paramDist(a, b) {
        // LARGEST normalised gap on any single dimension (Chebyshev), not the
        // mean: averaging over 24 dimensions would call two vectors identical
        // when one parameter differs by a seventh of its box, which is a
        // genuinely different policy. Two points are the same only when EVERY
        // dimension agrees.
        let worst = 0, n = 0;
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            const x = a && a[k], y = b && b[k];
            if (!isFinite(x) || !isFinite(y) || range <= 0) continue;
            worst = Math.max(worst, Math.abs(x - y) / range); n++;
        }
        return n ? worst : 1;
    }
    function hofRecord(reward, params) {
        const r = +reward.toFixed(4);
        // merge into the nearest entry if this vector is effectively the same
        let near = null, nearD = Infinity;
        for (const h of learn.hof) {
            const d = paramDist(h.p, params);
            if (d < nearD) { nearD = d; near = h; }
        }
        if (near && nearD < CONFIG.learning.hofMergeDist) {
            near.n = (near.n || 1) + 1;
            near.sum = (isFinite(near.sum) ? near.sum : near.r) + r;
            near.r = +(near.sum / near.n).toFixed(4);
            near.best = Math.max(isFinite(near.best) ? near.best : near.r, r);
        } else {
            learn.hof.push({ r, p: params, n: 1, sum: r, best: r });
        }
        // rank on the MEAN estimate, not on a single outlier run
        learn.hof.sort((a, b) => b.r - a.r);
        learn.hof = learn.hof.slice(0, 5);
    }
    function endTrial(reward) {
        if (!trialParams) return;
        const c = learn.cem;
        c.batch.push({ r: +reward.toFixed(4), p: trialParams, d: lastDeathCause, champ: championRun });
        // A champion replay carries no NEW vector — it is a fresh measurement
        // of one the hof already holds, so it updates that entry's mean and
        // can never clone it.
        hofRecord(reward, trialParams);
        trialParams = null;
        if (c.batch.length >= CONFIG.learning.batchSize) refitCem();
        applyParams(c.mean);
    }
    function refitCem() {
        const L = CONFIG.learning, c = learn.cem;
        const sorted = [...c.batch].sort((a, b) => b.r - a.r);
        const nElite = Math.max(2, Math.round(sorted.length * L.eliteFrac));
        // Refit toward this batch's best PLUS the all-time hall of fame, so
        // every generation is pulled by best-ever evidence, not just recent.
        const elites = sorted.slice(0, nElite).concat(learn.hof.slice(0, 3));
        if (!c.pc) c.pc = {};
        const oldMean = { ...c.mean };
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            const vals = elites.map(e => e.p && e.p[k]).filter(v => isFinite(v));
            if (!vals.length) continue;
            const m = vals.reduce((a, b) => a + b, 0) / vals.length;
            const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length);
            c.mean[k] = Math.min(spec.max, Math.max(spec.min, 0.3 * c.mean[k] + 0.7 * m));   // smoothed refit
            // Annealing: each generation explores a little less and exploits a
            // little more — iteration N+1 refines iteration N instead of
            // re-guessing it. The floor keeps it from ever going fully blind.
            c.sigma[k] = Math.max(range * L.sigmaFloor,
                Math.min(range * 0.35, (0.5 * c.sigma[k] + 0.5 * sd) * L.anneal));
        }
        // CMA-ES-lite: update the EVOLUTION PATH — the smoothed direction the
        // mean is travelling, in sigma units (scale-free). Future samples get
        // a correlated kick along this path, so parameters that improve
        // TOGETHER are explored together.
        for (const k of Object.keys(TUNABLE)) {
            const sg = Math.max(1e-9, c.sigma[k]);
            const delta = (c.mean[k] - oldMean[k]) / sg;
            const prev = isFinite(c.pc[k]) ? c.pc[k] : 0;
            c.pc[k] = Math.max(-3, Math.min(3, 0.8 * prev + 0.6 * delta));
        }

        // Record the improvement curve: mean reward of this generation's batch.
        const batchMean = c.batch.reduce((a, e) => a + e.r, 0) / c.batch.length;
        learn.genHistory.push(+batchMean.toFixed(4));
        if (learn.genHistory.length > 40) learn.genHistory.shift();

        // CMA-ES-lite: GLOBAL STEP-SIZE adaptation by success rule — a
        // generation that beat the last one earns a bigger exploration step;
        // a worse one shrinks it. Replaces blind annealing with feedback.
        if (!isFinite(c.ss)) c.ss = 1;
        if (isFinite(c.prevBatchMean)) {
            c.ss = batchMean > c.prevBatchMean
                ? Math.min(1.6, c.ss * 1.06)
                : Math.max(0.55, c.ss * 0.94);
        }
        c.prevBatchMean = batchMean;
        maybeRestart(batchMean);
        // Which hazard dominated this batch's deaths? Needed before the
        // gradient runs so its defence parameters can be shielded.
        const causeCount = {};
        for (const e of c.batch) if (e.d) causeCount[e.d] = (causeCount[e.d] || 0) + 1;
        let domCause = null, domN2 = 0;
        for (const k of Object.keys(causeCount)) if (causeCount[k] > domN2) { domN2 = causeCount[k]; domCause = k; }
        const domShare = c.batch.length ? domN2 / c.batch.length : 0;
        const domPool = domShare >= 0.4 ? DEATH_POOLS[domCause] : null;   // aligned with the nudge threshold

        // GRADIENT AUGMENTATION: elites say where the peak is; the FULL batch
        // says which way reward rises. A bounded correlation step per
        // parameter lets every run inform the move, not just the top 30%.
        const all = c.batch.concat(learn.hof.slice(0, 3));
        // v6.86.0: correlate against RANK, not raw reward. Survival time is
        // outlier-dominated (one 14000s run outweighs forty 900s runs), so a
        // Pearson step on raw reward fits whichever run got lucky with its
        // cocktail pool. Ranks make the gradient care about ordering only.
        const byR = [...all].sort((a, b) => a.r - b.r);
        const rankOf = new Map();
        byR.forEach((e, i) => rankOf.set(e, all.length > 1 ? i / (all.length - 1) - 0.5 : 0));
        for (const e of all) e._q = rankOf.get(e);
        const rMean = 0;
        const gradMoves = [];
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            let cov = 0, varP = 0, varR = 0;
            for (const e of all) {
                const pv = e.p && isFinite(e.p[k]) ? e.p[k] : null;
                if (pv == null) continue;
                const dp = pv - c.mean[k], dr = e._q - rMean;
                cov += dp * dr; varP += dp * dp; varR += dr * dr;
            }
            if (varP > 1e-9 && varR > 1e-9) {
                const corr = cov / Math.sqrt(varP * varR);   // -1..1
                let step = 0.04 * range * corr;
                // SHIELD: if one death cause dominates this batch, the
                // parameters that defend against it may not be eroded
                // further by the reward gradient (it optimises score, and
                // score is collected right up until the thing kills us).
                if (domPool && domPool.includes(k) && step < 0) step *= 0.25;
                c.mean[k] = Math.min(spec.max, Math.max(spec.min, c.mean[k] + step));
                gradMoves.push({ k, corr: +corr.toFixed(2), step: +step.toFixed(3) });
            }
        }
        // record the strongest gradient signals so the engine's reasoning is
        // visible in 🔍 diagnostics and the 📊 stats report
        gradMoves.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
        learn.lastGradient = { gen: c.gen + 1, samples: all.length, moves: gradMoves.slice(0, 6) };
        if (gradMoves.length) log('CEM gradient (gen ' + (c.gen + 1) + '):',
            gradMoves.slice(0, 3).map(m => m.k + (m.step > 0 ? ' +' : ' ') + m.step).join(', '));

        // Directed defense: if one hazard killed most of the batch, push the
        // parameters that guard against it.
        const causes = {};
        for (const e of c.batch) if (e.d) causes[e.d] = (causes[e.d] || 0) + 1;
        let dom = null, domN = 0;
        for (const k of Object.keys(causes)) if (causes[k] > domN) { domN = causes[k]; dom = k; }
        const pool = DEATH_POOLS[dom];
        if (pool && domN >= c.batch.length * 0.4) {
            // the nudge scales with dominance: a hazard causing 70%+ of
            // deaths gets a correction that can actually outrun the gradient
            const share = domN / Math.max(1, c.batch.length);
            const mag = L.deathNudge * (1 + 2 * Math.max(0, share - 0.4));
            for (const k of pool) {
                const spec = TUNABLE[k];
                // v6.122.0: clamp BOTH ends. The old one-sided Math.min had
                // no Math.max(spec.min, ...) — harmless while mag is 0 and
                // non-negative, and the wrong shape the moment this is
                // re-enabled with a decaying or negative magnitude.
                c.mean[k] = Math.max(spec.min, Math.min(spec.max, c.mean[k] + (spec.max - spec.min) * mag));
            }
            // v6.122.0: only claim it if it happened. deathNudge is 0, so
            // every generation where one cause took >=40% of the deaths
            // printed a line saying the learner had corrected against its
            // dominant killer, while nothing moved at all.
            if (mag > 0) log('CEM: defensive nudge against death by', dom, '(share', Math.round(share * 100) + '%, mag', mag.toFixed(3) + ')');
        }
        c.batch = [];
        c.gen++;
        log('CEM refit → generation', c.gen);
    }

    const DEATH_POOLS = {
        proj: ['threat.projWeight', 'threat.projLookaheadMs', 'movement.smoothing'],
        contact: ['threat.enemyWeight', 'movement.standoff', 'movement.standoffPull', 'threat.enemyRange', 'movement.panicHp'],
        mark: ['threat.markWeight', 'movement.lookaheadMs'],
        // v6.122.0: v6.111.0 split the lane weight into TELEGRAPH
        // (lineWeight) and LIVE CHARGE (lineArmedWeight) so each could be
        // priced on its own evidence — and this pool was never updated, so
        // the gradient shield (step *= 0.25 when one hazard dominates a
        // batch's deaths) protected only the telegraph. The weight on the
        // thing that actually kills was left at full erosion rate.
        line: ['threat.lineWeight', 'threat.lineArmedWeight', 'movement.lookaheadMs'],
        rival: ['movement.escapePull', 'movement.lookaheadMs', 'movement.panicHp']
    };

    // Re-derive the rainbow roadmap from measured build performance. Greedy
    // pick of 6: measured mean dominates; a cocktail whose super-key is
    // already in the chosen set gets a big bonus (one maxed ingredient, two
    // supers); keys that pair into 2-part secret crafts with chosen keys get
    // craft-synergy bonuses. With no data yet it falls back to sane defaults.
    // ---- roster experiment bandit -----------------------------------
    function rosterCandidates() {
        const ids = [];
        if (CONFIG.userRoadmap && Array.isArray(CONFIG.userRoadmap.cocktails)) ids.push('user');
        ids.push('auto');
        ids.push(...Object.keys(ROSTER_FIXED));
        return ids;
    }
    function rosterStat(id) {
        const s = learn.rosters && learn.rosters[id];
        return (s && s.n > 0) ? { n: s.n, mean: s.sum / s.n } : null;
    }
    // Deterministic UCB over whole rosters. Unseen rosters get an optimistic
    // prior (recent baseline + a nudge) so each earns auditions; the user's
    // prescribed build carries a permanent incumbent edge, so ties and
    // no-data states always resolve to it.
    function rosterUcb(id) {
        const s = rosterStat(id);
        const total = Object.values(learn.rosters || {}).reduce((a, b) => a + (b.n || 0), 0) + 1;
        const mean = s ? s.mean : (baseline() ?? 0.8) + 0.05;
        let v = mean + CONFIG.learning.rosterExplore * Math.sqrt(Math.log(total + 1) / (1 + (s ? s.n : 0)));
        if (id === 'user') v += CONFIG.learning.rosterIncumbentEdge;
        return v;
    }
    function chooseRoster() {
        const ids = rosterCandidates();
        const incumbent = ids.includes('user') ? 'user' : 'auto';
        if (!CONFIG.rosterExperiment) return incumbent;
        // warmup runs and champion runs play the proven thing, not an audition
        const nextRun = (learn.runs || 0) + 1;
        if (nextRun <= CONFIG.learning.tuningWarmupRuns) return incumbent;
        if (nextRun % 4 === 0 && learn.hof.length) {
            let best = incumbent, bestM = -Infinity;
            for (const id of ids) {
                const s = rosterStat(id);
                if (s && s.n >= 2 && s.mean > bestM) { bestM = s.mean; best = id; }
            }
            return best;
        }
        let best = incumbent, bestV = -Infinity;
        for (const id of ids) {
            const v = rosterUcb(id);
            if (v > bestV) { bestV = v; best = id; }
        }
        return best;
    }

    function computeRoadmap() {
        activeRoster = chooseRoster();
        // The prescribed build — the incumbent — and the fixed experiment
        // rosters are literal plans; 'auto' falls through to self-composition.
        if (activeRoster === 'user' && CONFIG.userRoadmap && Array.isArray(CONFIG.userRoadmap.cocktails)) {
            // v6.87.0: the prescribed roster is PER CHARACTER. A tank and a
            // runner share a core (SOUTH SIDE / NEGRONI / OLIVE) and diverge
            // on everything else; running one plan for both meant Pat built
            // minguk's stall roster and could never reach VODKA MARTINI.
            // computeRoadmap() is called from beginTrial, after the bartender
            // for the run is chosen, so activeChar is already correct here.
            const cr = (CONFIG.charRoadmap || {})[activeChar];
            const plan = (cr && Array.isArray(cr.cocktails)) ? cr : CONFIG.userRoadmap;
            PLAN_COCKTAILS = plan.cocktails.slice();
            PLAN_INGREDIENTS = plan.ingredients.slice();
            return;
        }
        if (ROSTER_FIXED[activeRoster]) {
            PLAN_COCKTAILS = ROSTER_FIXED[activeRoster].cocktails.slice();
            PLAN_INGREDIENTS = ROSTER_FIXED[activeRoster].ingredients.slice();
            return;
        }
        const meanOf = c => {
            const b = learn.builds && learn.builds[c];
            return (b && b.n >= 3) ? b.sum / Math.max(1, b.n) : null;
        };
        const chosen = [], keys = new Set();
        // self-composition draws only from the user-approved cocktail list
        const pool = COCKTAILS.filter(c => !AVOID_COCKTAILS.has(c));
        const totalBuildRuns = Object.values(learn.builds || {}).reduce((a, b) => a + (b.n || 0), 0) + 1;
        while (chosen.length < 6 && pool.length) {
            let best = null, bestV = -Infinity;
            for (const c of pool) {
                const m = meanOf(c);
                let v = (m != null ? m : 0.85) * 100;      // measured performance dominates
                // exploration: under-tried builds earn audition slots (UCB),
                // shrinking as their sample grows — explore/exploit balance
                const bb = learn.builds && learn.builds[c];
                v += 18 * Math.sqrt(Math.log(totalBuildRuns + 1) / (1 + (bb ? bb.n : 0)));
                const k = SUPER_KEY_INGREDIENT[c];
                if (keys.has(k)) v += 40;                   // shared key: a super for free
                else {
                    for (const evo of EVOLUTIONS) {
                        if (!evo.parts.includes(k)) continue;
                        v += evo.parts.filter(p => keys.has(p)).length * 18;   // craft synergy
                        if (evo.parts.length === 2) v += 6;                    // cheap crafts preferred
                    }
                }
                if (v > bestV) { bestV = v; best = c; }
            }
            chosen.push(best);
            keys.add(SUPER_KEY_INGREDIENT[best]);
            pool.splice(pool.indexOf(best), 1);
        }
        PLAN_COCKTAILS = chosen;
        PLAN_INGREDIENTS = [...keys];
    }

    // Measured cocktail priority: once a build has real data (3+ runs), its
    // MEASURED mean replaces the hand-written static table on the same scale
    // (mean 1.2 → 30, mean 0.27 → 7). The static table only seeds unknowns.
    // This is what "optimal weapon choice" means at 900+ runs: the data
    // picks, not the guesses.
    function cocktailPriority(name) {
        const b = learn.builds && learn.builds[name];
        if (b && b.n >= 3) return Math.round((b.sum / b.n) * 25);
        return COCKTAIL_PRIORITY[name] || 20;
    }
    // Same principle for passives: measured item performance replaces the
    // static seed once 3+ runs of data exist (real data, augmented by the
    // recipe-book role bonuses added on top in scoreCard).
    function ingredientPriority(name) {
        const s = learn.items && learn.items[name];
        if (s && s.n >= 3) return Math.max(5, Math.min(40, Math.round((s.sum / s.n) * 20)));
        return INGREDIENT_PRIORITY[name] ?? 8;
    }

    // Build-level bandit: which PRIMARY cocktail actually produces long runs.
    function buildUcb(name) {
        const s = learn.builds[name];
        if (!s || !s.n) return 3;   // mild optimism for untried builds
        const mean = s.sum / s.n;
        const ref = baseline() ?? mean;
        return Math.max(-15, Math.min(15, (mean - ref) * 40)) +
            1.2 * Math.sqrt(Math.log(Math.max(2, learn.runs)) / s.n);
    }

    // =================================================================
    // CONTEXTUAL BANDIT (diagonal LinUCB) — the learned layer OVER the
    // hand-crafted card scores. Learns which picks pay off in which game
    // STATE (phase, HP, enemy mix, hell) from every logged run, instead of
    // one context-free mean per card. Bounded so recipe-book knowledge and
    // user directives always keep the casting vote.
    // =================================================================
    const CTX_D = 10;
    function pickContext() {
        const ph = gamePhase();
        const mixTotal = Math.max(1, enemyMix.total);
        return [
            1,                                            // bias
            ph === 'early' ? 1 : 0,
            ph === 'mid' ? 1 : 0,
            ph === 'late' ? 1 : 0,
            hellDetected ? 1 : 0,
            (() => { const p = G.player; if (!p) return 1; const m = p.maxHp || 100; return Math.max(0, Math.min(1, (p.hp ?? m) / m)); })(),
            Math.max(0, Math.min(1, dpsDeficit)),
            Math.min(1, enemyMix.boss / mixTotal * 4),    // boss share (scaled)
            Math.min(1, enemyMix.ranged / mixTotal * 3),  // ranged share (scaled)
            Math.min(1, passoutAvg / 3)                   // farm richness
        ];
    }
    function ctxLearnBonus(name, x) {
        const m = learn.linucb && learn.linucb[name];
        if (!m || !Array.isArray(m.A) || !Array.isArray(m.b)) return 0;
        const lam = 1, alpha = 1.2;
        let est = 0, unc = 0;
        for (let i = 0; i < CTX_D; i++) {
            const Ai = (isFinite(m.A[i]) ? m.A[i] : 0) + lam;
            const th = (isFinite(m.b[i]) ? m.b[i] : 0) / Ai;   // per-feature ridge estimate
            est += th * x[i];
            unc += (x[i] * x[i]) / Ai;
        }
        // reward scale ~0-2.5 -> score scale: x8, hard-bounded so the learned
        // layer nudges but never overrules the knowledge-based score
        const v = est * 8 + alpha * Math.sqrt(unc) * 2;
        return Math.max(-12, Math.min(12, Math.round(v * 10) / 10));
    }
    // =================================================================
    // v6.107.0 TAG BANDIT — the same LinUCB, keyed on ATTACK TYPE.
    // =================================================================
    // The card bandit above is per-NAME, so "freeze pays when bosses are the
    // live threat" has to be relearned from scratch for every freeze card,
    // and a card picked five times never gets there. Tags are the shared
    // structure: WHISKY SOUR's `freeze`, GIN TONIC's `slow`, SOUTH SIDE's
    // `zones` are each measured across every card that carries them, so one
    // pass of runs teaches all of them.
    //
    // WHY THIS MATTERS MORE THAN IT LOOKS (user): the game is AI-built and
    // "has several bugs and misclassifications — the truth is what's being
    // observed in the game itself." WEAPON_TAGS is a HYPOTHESIS derived from
    // the recipe book, and two of its entries were wrong until the user
    // corrected them from play. This bandit is how the hypothesis gets
    // MEASURED: a tag whose learned weight never separates from zero is a tag
    // that does not describe anything real, and `pineBot.report().tags` is
    // where that shows up. It is evidence about the table, not just a bonus.
    //
    // Deliberately bounded TIGHTER than the per-card layer (+/-8 vs +/-12): a
    // generalisation across cards should never outvote a card's own record.
    // Shares CTX_D and the context vector, so no stored-shape migration.
    function tagsOf(name) {
        const w = (typeof WEAPON_TAGS !== 'undefined' && WEAPON_TAGS[name]) || null;
        const i = (typeof INGREDIENT_TAGS !== 'undefined' && INGREDIENT_TAGS[name]) || null;
        return w || i || [];
    }
    function tagLearnBonus(name, x) {
        const tags = tagsOf(name);
        if (!tags.length || !learn.tagucb) return 0;
        const lam = 1, alpha = 1.0;
        let sum = 0, seen = 0;
        for (const t of tags) {
            const m = learn.tagucb[t];
            if (!m || !Array.isArray(m.A) || !Array.isArray(m.b)) continue;
            let est = 0, unc = 0;
            for (let i = 0; i < CTX_D; i++) {
                const Ai = (isFinite(m.A[i]) ? m.A[i] : 0) + lam;
                est += ((isFinite(m.b[i]) ? m.b[i] : 0) / Ai) * x[i];
                unc += (x[i] * x[i]) / Ai;
            }
            sum += est * 8 + alpha * Math.sqrt(unc) * 2;
            seen++;
        }
        if (!seen) return 0;
        // MEAN, not sum: a card with four tags must not outscore a card with
        // one purely by carrying more labels. The table's granularity is an
        // artefact of how it was written, not a property of the weapon.
        const v = sum / seen;
        return Math.max(-8, Math.min(8, Math.round(v * 10) / 10));
    }
    function creditTagUcb(reward) {
        if (!learn.tagucb) learn.tagucb = {};
        const total = Math.max(1, runPickCtx.length);
        for (let i = 0; i < runPickCtx.length; i++) {
            const { name, x } = runPickCtx[i];
            const w = 1.5 - 0.5 * (i / total);
            for (const t of tagsOf(name)) {
                const m = learn.tagucb[t] || { n: 0, A: new Array(CTX_D).fill(0), b: new Array(CTX_D).fill(0) };
                for (let j = 0; j < CTX_D; j++) {
                    m.A[j] = (isFinite(m.A[j]) ? m.A[j] : 0) * 0.999 + w * x[j] * x[j];
                    m.b[j] = (isFinite(m.b[j]) ? m.b[j] : 0) * 0.999 + w * reward * x[j];
                }
                m.n = (m.n || 0) + w;
                learn.tagucb[t] = m;
            }
        }
    }
    function creditLinUcb(reward) {
        const total = Math.max(1, runPickCtx.length);
        for (let i = 0; i < runPickCtx.length; i++) {
            const { name, x } = runPickCtx[i];
            const w = 1.5 - 0.5 * (i / total);   // early picks shape the run (same rule as the item bandit)
            const m = learn.linucb[name] || { n: 0, A: new Array(CTX_D).fill(0), b: new Array(CTX_D).fill(0) };
            for (let j = 0; j < CTX_D; j++) {
                m.A[j] = (isFinite(m.A[j]) ? m.A[j] : 0) * 0.999 + w * x[j] * x[j];
                m.b[j] = (isFinite(m.b[j]) ? m.b[j] : 0) * 0.999 + w * reward * x[j];
            }
            m.n = (m.n || 0) + w;
            learn.linucb[name] = m;
        }
    }

    // SPAWN TIMETABLE (source-extracted): boss/mob composition is gated on
    // set times (minute tiers at ~2 and ~4 min; the heavy boss band at
    // 480-680s; passout/no-booking density on gameTime/60-90 curves). The
    // 35s BEFORE each unlock is the prep window: buy damage and boss tools
    // so the new arrival converts to loot instead of a death.
    const BOSS_UNLOCK_S = [120, 240, 480, 540, 600, 680];   // source-extracted fallback
    function bossSchedule() {
        // MEASURED first: once 2+ runs have observed a boss class's arrival
        // time, the in-game data replaces the source-derived constants.
        const intel = learn.spawnIntel || {};
        const measured = Object.entries(intel)
            .filter(([k, v]) => /boss|nobook/i.test(k) && v.n >= 2)
            .map(([k, v]) => Math.round(v.sum / v.n))
            .sort((a, b) => a - b);
        return measured.length >= 3 ? measured : BOSS_UNLOCK_S;
    }
    function upcomingBossUnlock() {
        const gt = typeof G.gameTime === 'number' ? G.gameTime : 0;
        for (const t of bossSchedule()) if (gt < t && t - gt <= 35) return t;
        return 0;
    }

    // RAINBOW-OR-NOT (user directive): if a pure six-supers + consumable-
    // chaining run can reach the 126:43 crown, that path is worth exploring
    // too. When the gun is offered INSIDE the window, a two-arm bandit
    // chooses take-vs-skip from measured run rewards. 'take' starts with the
    // stronger prior (the 88:51 rainbow run is the best on record).
    function chooseRainbowPolicy() {
        if (CONFIG.rainbowPolicyOverride === 'take' || CONFIG.rainbowPolicyOverride === 'skip')
            return CONFIG.rainbowPolicyOverride;
        const P = learn.rainbowPolicy || {};
        const stat = a => (P[a] && P[a].n > 0) ? { n: P[a].n, mean: P[a].sum / P[a].n } : null;
        const total = ['take', 'skip'].reduce((x, a) => x + ((P[a] && P[a].n) || 0), 0) + 1;
        const score = a => {
            const st = stat(a);
            const prior = (baseline() ?? 0.9) + (a === 'take' ? 0.15 : 0.05);
            const mean = st ? st.mean : prior;
            return mean + 0.25 * Math.sqrt(Math.log(total + 1) / (1 + (st ? st.n : 0)));
        };
        return score('take') >= score('skip') ? 'take' : 'skip';
    }


    // =================================================================
    // UPGRADE SCORING
    // =================================================================
    // SCORING PROFILE. 'crown-6.74' replays the level-up rules of the release
    // that actually won the hell crown; '6.79' plays the post-crown rules
    // (SUPER NEGRONI refused as a no-op, CAMPARI de-emphasised in hell,
    // slot-theft / craft-finish / plan-super bonuses). Both are tagged
    // separately in the version comparison, so the question "did the 6.79
    // scoring changes help or hurt?" gets answered by the snapshot table.
    const CROWN = CONFIG.scoringProfile === 'crown-6.74';

    function nameOf(card) {
        if (!card) return '';
        const raw = card.n || card.name || card.key || '';
        return String(raw).toUpperCase().replace(/\s+/g, ' ').trim();
    }
    function baseNameOf(card) {
        // strip a trailing "Lv3" / "LV 3" / "+1" decoration if present
        return nameOf(card).replace(/\s*(LV\.?\s*\d+|\+\d+)\s*$/i, '').trim();
    }
    function levelOf(card) {
        if (card && typeof card.lv === 'number') return card.lv;
        return ownedLevels[baseNameOf(card)] || 0;
    }
    function maxLevelOf(card) {
        if (card && typeof card.maxlv === 'number' && card.maxlv > 0) return card.maxlv;
        return ownedMax[baseNameOf(card)] || 6;
    }

    function unfinishedCocktails() {
        let n = 0;
        for (const c of COCKTAILS) {
            const lv = ownedLevels[c];
            if (lv != null && lv > 0 && lv < (ownedMax[c] || 6)) n++;
        }
        return n;
    }
    function isMaxed(name) {
        const lv = ownedLevels[name];
        return lv != null && lv >= (ownedMax[name] || 6);
    }

    // v6.89.0 — THE ABSORBED-KEY BLIND SPOT.
    // isMaxed() answers "is this ingredient at Lv6 right now". For super
    // evolution that is the WRONG question, because a secret craft eats its
    // parts: once SWEET VERMOUTH + DRY VERMOUTH fuse into BLACK VERMOUTH both
    // halves leave ownedLevels, yet the game still treats their maxed keys as
    // satisfied. Every gun guard below is built on the key's level, so all of
    // them silently switched OFF the instant the craft the plan deliberately
    // pursues completed — and MANHATTAN, the cocktail that key unlocks, has
    // been showing up as a build for versions (6.85.5, 6.85.21, 6.86.1,
    // 6.86.10, 6.88.5). This is the question the guards should have asked.
    //
    // Three independent sources, cheapest first: the live level, the set we
    // record as levels land, and the craft's own result sitting in the bar.
    // The last one covers a craft that fused without a card we scored.
    function keyEffectivelyMaxed(key) {
        if (!key) return false;
        if (isMaxed(key)) return true;
        if (everMaxed.has(key)) return true;
        try {
            for (const evo of EVOLUTIONS) {
                if (!evo.parts.includes(key)) continue;
                if ((ownedLevels[evo.result] || 0) > 0) return true;
                const abs = G.player && G.player.absorbed;
                if (abs && (Array.isArray(abs) ? abs : Object.keys(abs))
                    .some(a => String(a).toUpperCase() === key)) return true;
            }
        } catch (e) { }
        return false;
    }

    function evolutionSynergy(name) {
        let bonus = 0;
        for (const evo of EVOLUTIONS) {
            if (!evo.parts.includes(name)) continue;
            const others = evo.parts.filter(p => p !== name);
            const ready = others.filter(isMaxed).length;
            if (ready === others.length) bonus += 30;          // this completes the craft
            else if (ready > 0) bonus += 10 * ready;
        }
        return bonus;
    }

    // Rainbow Gun math: it needs SIX super cocktails, and each super needs
    // base attack MAXED + that cocktail at Lv6 + its key ingredient MAXED.
    // So the strategy is a ROSTER, not a single build: finish cocktails one
    // after another, prefer ones whose key ingredient is already leveled
    // (GIN TONIC + VODKA TONIC share TONIC; COSMO + MARGARITA share ORANGE),
    // and treat the base attack as a must-max gate.
    function ownedCocktailCount() {
        let n = 0;
        for (const c of COCKTAILS) if ((ownedLevels[c] || 0) > 0) n++;
        return n;
    }
    // Deploy each PASSIVE for its intended purpose against the live field.
    function ingredientContextBonus(name) {
        const tags = INGREDIENT_TAGS[name] || [];
        let b = 0;
        if (tags.includes('dps')) b += Math.round(10 * dpsDeficit);              // losing the race: buy raw output
        if (tags.includes('dps') && passoutAvg > 1) b += 5;                      // DPS also cashes out passout loot faster
        if (tags.includes('pierce') && enemyMix.total > 12) b += 6;              // pierce cuts through mob lines
        if (tags.includes('shred') && (enemyMix.boss > 0.5 || hellDetected)) b += 6;  // CAMPARI: defense-down amplifies boss damage
        if (tags.includes('mobility') && (lastDeathCause === 'contact' || lastDeathCause === 'proj')) b += 5;
        if (tags.includes('regen') && lastDeathCause) b += 4;                    // dying at all: sustain helps
        if (tags.includes('economy') && dpsDeficit < 0.15 && gamePhase() !== 'early') b += 5;
        if (tags.includes('ult') && hellDetected) b += 4;                        // more invincibility uptime in hell
        return b;
    }

    // Match a weapon's REAL attack pattern (recipe book) to the current field.
    function enemyContextBonus(name) {
        const tags = WEAPON_TAGS[name] || [];
        let b = 0;
        const swarmHeavy = enemyMix.total > 12;
        const bossP = enemyMix.boss > 0.5 || hellDetected;
        if (swarmHeavy && tags.some(t => ['aoe', 'swarm', 'aura', 'orbit', 'line', 'zones', 'pierce', 'chain'].includes(t))) b += 8;
        if (bossP && tags.some(t => ['boss', 'sniper', 'homing', 'burst', 'tanky'].includes(t))) b += 8;
        if (bossP && tags.includes('knockback')) b += 5;
        if (lastDeathCause === 'contact' && tags.some(t => ['control', 'knockback', 'freeze', 'defense'].includes(t))) b += 6;
        // v6.107.0 THE DEGREE OF CONTROL, against bosses (user: "gin and vodka
        // tonic slow the bosses, not exactly freeze"). A full freeze STOPS a
        // boss and a stopped boss deals no contact damage at all; a slow only
        // buys kiting room. Ranked, not equal — and mutually exclusive so a
        // card carrying both tags is paid once, at the higher rate.
        if (bossP && tags.includes('freeze')) b += 7;
        else if (bossP && tags.includes('slow')) b += 4;
        return b;
    }

    // Deep-focus rule: while any owned cocktail is still below this level,
    // taking ANOTHER new cocktail splits our DPS and gets us killed early.
    function ownedCocktailBelow(lvl) {
        for (const c of COCKTAILS) {
            const l = ownedLevels[c] || 0;
            if (l > 0 && l < lvl) return true;
        }
        return false;
    }
    // Early game is about not dying: pump DPS into what we own before
    // spreading wide for the rainbow roster.
    function gamePhase() {
        const t = G.gameTime;
        if (typeof t !== 'number') return 'mid';
        return t < 360 ? 'early' : (t < 900 ? 'mid' : 'late');
    }


    // v6.87.5: is a SUPER already qualified and just waiting for its trigger?
    // openRecipe(): "base attack MAX + cocktail Lv6 + key ingredient MAX ->
    // evolve at a BOSS TIP". Everything but the tip is inspectable, so this
    // answers "is there a super lying on the floor inside the next tip?".
    // Used by the loot valuer, which is why it lives at module scope.
    function evolutionPending() {
        try {
            const sl = (G.player && G.player.superLv) || {};
            const made = c => {
                const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                return Object.keys(sl).some(s2 => s2.toLowerCase().replace(/[^a-z0-9]/g, '') === k && sl[s2] > 0);
            };
            for (const c of COCKTAILS) {
                if (made(c)) continue;
                if ((ownedLevels[c] || 0) < (ownedMax[c] || 6)) continue;
                const key = SUPER_KEY_INGREDIENT[c];
                if (!key || (ownedLevels[key] || 0) < (ownedMax[key] || 6)) continue;
                return true;
            }
        } catch (e) { }
        return false;
    }

    // NOTE (v6.87.3): this lives ABOVE scoreCard deliberately. Its
    // neighbours — opensNewSuperLine, liveSuperCount, isCraftFinish — are
    // nested INSIDE scoreCard, which is invisible until something outside
    // tries to call them. handleLevelUp needs this one, so it belongs at
    // module scope.
    // v6.87.2 (user: "the bot needs to choose from the junk pool that doesn't
    // lead to the rainbow gun upgrade" + "cap the supercocktails to 5").
    //
    // opensNewSuperLine() above only fires on the LAST pick of a line — the
    // one where the other half is already maxed. That is too late to steer a
    // junk pool: the picks that actually walk the bot toward a sixth super are
    // the ordinary-looking ones several levels earlier. This returns how far
    // a card carries an OFF-PLAN line, 0 (cannot ever) .. 1 (completes it now),
    // so junk can be ORDERED by it instead of only vetoed at the end.
    //
    // Lines that can never complete score 0 and are not penalised: a key on
    // the permanent ban list (LEMON, ORANGE — neither is ever hell-unbanned)
    // means that super is unreachable no matter how many levels go in.
    function gunPathProgress(type, name) {
        try {
            const sl = (G.player && G.player.superLv) || {};
            const made = c => {
                const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                return Object.keys(sl).some(s2 => s2.toLowerCase().replace(/[^a-z0-9]/g, '') === k && sl[s2] > 0);
            };
            const NEVER_UNBANNED = new Set(['LEMON', 'ORANGE']);
            const cocktails = [];
            if (type === 'weapon' && COCKTAILS.includes(name)) cocktails.push(name);
            else if (type === 'passive') for (const c of COCKTAILS) if (SUPER_KEY_INGREDIENT[c] === name) cocktails.push(c);
            let worst = 0;
            for (const c of cocktails) {
                if (PLAN_COCKTAILS.includes(c)) continue;      // one of the sanctioned five
                if (made(c)) continue;                          // already a line we counted
                const key = SUPER_KEY_INGREDIENT[c];
                if (!key || NEVER_UNBANNED.has(key)) continue;  // unreachable line: harmless
                const cMax = ownedMax[c] || 6, kMax = ownedMax[key] || 6;
                const cLv = Math.min(cMax, (ownedLevels[c] || 0) + (type === 'weapon' ? 1 : 0));
                // v6.89.0: an ABSORBED key still counts (see keyEffectivelyMaxed).
                // Reading ownedLevels here scored a post-craft MANHATTAN line at
                // 0.5 risk when it was really 1 cocktail from a sixth super.
                const kLv = keyEffectivelyMaxed(key) ? kMax
                    : Math.min(kMax, (ownedLevels[key] || 0) + (type === 'passive' ? 1 : 0));
                worst = Math.max(worst, (cLv / cMax + kLv / kMax) / 2);
            }
            return worst;
        } catch (e) { return 0; }
    }

    // v6.88.5 LAST-RESORT CLAMP (user: "mule out unless it's the only option
    // that doesn't make a 6th cocktail"). A small positive bonus could not do
    // this: MOSCOW MULE still collected the generic cocktail credit
    // (progress+70, knockback-to-6+36 ...) and scored 111 against COFFEE BEANS'
    // 75 — the bot would have SOUGHT it. A last resort is defined by its
    // CEILING, not by a nudge.
    //
    // It has to be a wrapper rather than a line before the return, because
    // scoreCard has several exit points: clamping at one of them let the later
    // add() calls re-inflate the score right past it. Clamping outside catches
    // every path by construction.
    function scoreCard(card, index, poolArr) {
        const r = scoreCardInner(card, index, poolArr);
        if (!r || !LAST_RESORT.includes(r.name)) return r;
        const maxed = r.lv > 0 && r.cap && r.lv >= r.cap;
        if (!maxed && r.score > LAST_RESORT_CEILING) {
            r.why += 'last-resort-clamp' + Math.round(LAST_RESORT_CEILING - r.score) + ' ';
            r.score = LAST_RESORT_CEILING;
        }
        return r;
    }
    function scoreCardInner(card, index, poolArr) {
        const type = String((card && card.type) || '').toLowerCase();
        const name = baseNameOf(card);
        // Does THIS pool offer a prescribed cocktail? Fallback substitutes
        // (off-plan cocktails whose super key is in our ingredient plan)
        // only earn their bonus when the answer is no — the user's rule:
        // "if the preferred cocktails are not available, pick the best next".
        const poolHasPlan = Array.isArray(poolArr) && poolArr.some(c =>
            String((c && c.type) || '').toLowerCase() === 'weapon' &&
            PLAN_COCKTAILS.includes(baseNameOf(c)));
        const lv = levelOf(card);
        const cap = maxLevelOf(card);
        const atCap = lv > 0 && lv >= cap;
        let score = 0;
        const why = [];
        const add = (v, tag) => { if (v) { score += v; why.push(tag + (v > 0 ? '+' : '') + v.toFixed(0) + ' '); } };

        switch (type) {
            case 'rainbowup': {
                // ── v6.122.0 RESOLVE THE POLICY BEFORE **EVERY** BREAK ─────
                // 6.88.0's AUDIT D2 moved this write above the banRainbowGun
                // break and left it below the hell break. The sole consumer is
                // `stallMode = rainbowChoice === 'skip' && hellDetected &&
                // !zoner` — so the only write to rainbowChoice in the codebase
                // was unreachable in exactly the state the read requires, and
                // the stall doctrine has been permanently OFF. Verified: a
                // hell run leaves runLog[].rbp undefined and
                // learn.rainbowPolicy empty; a day run records 'skip'.
                if (!rainbowChoice) rainbowChoice = chooseRainbowPolicy();
                // HARD LOCK (user): no Rainbow Gun in hell mode, ever —
                // regardless of slots, supers, or the learned policy.
                if (hellDetected) { add(-500, 'no-gun-in-hell'); break; }
                // USER-VERIFIED LIMITATION: the fresh Rainbow Gun is WEAK
                // compared to the six supers it replaces — taken at the first
                // opportunity it collapses the run's DPS and gets the bot
                // contact-killed. The window that works is the 25-30 MINUTE
                // mark (1500s+): the supers carry until then, the gun scales
                // after. Before the window the card scores below the re-roll
                // threshold, so weak pools get re-rolled instead of pulling
                // the trigger early.
                // v6.86.9 (user): "rainbow gun should be explicitly banned
                // from being built — there's enough choices on the weapon and
                // ingredients roster to avoid that". The gun REPLACES the base
                // attack (`if(player.rainbow){ fireRainbow(); return; }`) and
                // a fresh one is weaker than the build it replaces, so runs
                // were ending shortly after it appeared. This is no longer a
                // learned policy or a timing window — it is a ban. Only a pool
                // with literally nothing else can force it.
                // v6.88.0 AUDIT D2: resolve the policy BEFORE the ban's break.
                // It used to sit one line after it, which made the only write
                // to `rainbowChoice` in the codebase unreachable — so it stayed
                // null and `stallMode` in the planner (05: rainbowChoice ===
                // 'skip' && hellDetected && !zoner) was permanently false. The
                // documented stall doctrine never engaged: a hell run at 60% HP
                // with no zoner still charged bosses. The gun stays banned;
                // only the bookkeeping moved above the break.
                if (!rainbowChoice) rainbowChoice = chooseRainbowPolicy();
                if (CONFIG.banRainbowGun) { add(-1000, 'gun-BANNED'); break; }
                const gtNow = typeof G.gameTime === 'number' ? G.gameTime : 0;
                // v6.85.21 (user: "rainbowgun is still appearing"). Skip
                // scored the gun at 18 — a REFUSAL that outbid every avoided
                // filler (they score negative) and every weak card under 18.
                // In a bad pool with no re-rolls left, 18 won and the bot
                // took the gun against its own policy. A skip is now a hard
                // veto (-500): the gun loses to literally anything else the
                // pool offers, and only an all-rainbow pool can force it.
                if (rainbowChoice !== 'take') { add(-500, 'no-gun-skip-policy'); break; }
                if (gtNow >= CONFIG.strategy.rainbowReadyS) add(400, 'RAINBOW');
                else add(18, 'rainbow-too-early');   // take policy: wait for the 25-min window
                break;
            }
            case 'rbstat': add(220, 'rainbow-stat'); break;
            case 'evolve': add(300, 'evolve'); break;
            case 'super':
                add(260, 'super');
                // v6.86.4: the +120 first-super premium is RETRACTED. The
                // manual Pat demo reached 19:42 with its FIRST super at 16:49
                // (3 by the end) — the human's order is armour, then the
                // ultimate, and supers arrive late on their own. Rushing one
                // would have cost the OLIVE 6 / NEGRONI 5 / ULT lv5 spine
                // that actually carried the run.
                if (charOf().style === 'tank' && supersThisRun === 0) add(20, 'tank-first-super');
                break;
            case 'ult':
                // USER DIRECTIVE: the ULTIMATE is the highest-priority pick —
                // it single-handedly clears passout fields, and maxed by ~20
                // min it deletes the boss ladder. Only the gun outranks it.
                add(320, 'ultimate');
                if (CONFIG.userRoadmap) add(20, 'user-build');
                // v6.86.4/5: for a TANK the ultimate is the whole passout
                // economy — two manual demos cleared 41 and ~20 bodies with
                // nothing else touching them. Each level doubles the spiral
                // (dmg*9.6*2^(lv-1)), and the premium runs to the CAP: demo 2
                // reached lv6 by 14:52 and its casts wiped million-HP fields
                // outright (3->0, 4->0), where its own lv1-lv3 casts had only
                // chipped a field of 3 down to 1.
                if (charOf().style === 'tank') {
                    const ulv = safe(() => player.ultLevel, 1) || 1;
                    if (ulv < 6) add(40, 'tank-ult-spine');
                }
                break;
            case 'base':
                // USER DIRECTIVE (top of the roadmap): SHAKING levels gate
                // EVERY super at Lv6 — base attack and the ultimate are the
                // top-priority picks whenever offered, above regular roster
                // cocktails/ingredients (only super/evolve/rainbow outrank).
                {
                    // "ALWAYS pick SHAKING UP or the ultimate when available"
                    // (user) — base sits directly under the ult, above evolves.
                    // MINGUK EXCEPTION (user): on the stall doctrine the base
                    // attack is not the damage engine, so it yields when the
                    // same pool offers a craft FINISH (a fusion that frees an
                    // ingredient slot) or the key that unlocks SUPER SOUTH SIDE.
                    let baseScore = 310;
                    if (CONFIG.rainbowPolicyOverride === 'skip' && Array.isArray(poolArr)) {
                        const yieldsTo = poolArr.some(c => {
                            const t2 = String((c && c.type) || '').toLowerCase();
                            const n2 = baseNameOf(c);
                            const clv = levelOf(c), ccap = maxLevelOf(c);
                            if (clv > 0 && ccap && clv >= ccap) return false;
                            if (isCraftFinish(t2, n2)) return true;
                            return t2 === 'passive' && n2 === 'MINT' &&
                                (ownedLevels['SOUTH SIDE'] || 0) >= (ownedMax['SOUTH SIDE'] || 6);
                        });
                        // the first 20 minutes are when ingredient space and
                        // craft timing actually decide the run (user)
                        const dayPhase = !hellDetected && (typeof G.gameTime !== 'number' || G.gameTime < 1200);
                        if (yieldsTo) baseScore = dayPhase ? 100 : 150;
                    }
                    add(atCap ? -40 : baseScore, 'base-attack');
                }
                if (!atCap && supersThisRun === 0 && ownedCocktailCount() >= 1) add(10, 'super-gate');
                break;
            case 'sp_firecross': add(70 + (hellDetected ? 15 : 0), 'firecross'); break;
            case 'sp_timestop': {
                // v6.88.3 — MEASURED, not doctrinal. The live 373-minute Pat
                // run (gt 22402, 121 minutes past the crown, 441/441 HP) reads
                // `timestopBonus: 162`. That is +162 SECONDS on every TIME STOP
                // pickup, roughly 81 stacked `+2s` picks, and it is the largest
                // number in the entire player object — larger than every damage
                // multiplier, every mitigation term, and every sustain source
                // combined. It also matches manual demo #3: 22 of 31 picks
                // after 26:00 were TIME STOP +2S.
                //
                // The corner and the ult chain keep you alive BETWEEN stops;
                // the stops are what make a 234-enemy field irrelevant. So this
                // is not one card type among several, it is the endgame engine,
                // and its value COMPOUNDS with depth rather than saturating.
                const gtT = typeof G.gameTime === 'number' ? G.gameTime : 0;
                let v = 130 + (hellDetected ? 45 : (gtT > 1000 ? 25 : 0));
                // past the deep-deep threshold nothing else on a card is worth
                // more; below it the old weighting stands unchanged.
                if (gtT > (CONFIG.deepHell.cornerAnchorFromS || 9000)) v += 90;
                // v6.110.0 — THE SWITCH IS THE MAXED ULT, NOT A CLOCK.
                // The joe recording is unambiguous: ULTIMATE UP at 1631, 1680
                // and 1740 taking the ult to lv6, and then TIME STOP +2S for
                // the next TWENTY picks without a single exception, from 1783
                // to 4482 — beating supers and evolves the whole way. frzShare
                // reaches 1.00 in deep and the field never moves again. The
                // pat 89-minute demo said the same (22 of 31 picks after
                // 26:00) and was filed as "confirmed, no scoring change made".
                // Two independent human recordings is no longer a coincidence.
                // Keyed on the ult being DONE rather than on gt, because that
                // is the transition the human actually plays: finish the
                // engine, then stack stops forever.
                else if (hellDetected && (safe(() => G.player.ultLevel, 0) || 0) >= 6) v += 90;
                else if (hellDetected && gtT > 2400) v += 40;
                add(v, 'timestop');
                break;
            }
            case 'sp_tequila': add(65, 'tequila'); break;
            case 'gold': add(14, 'gold'); break;
            case 'gen': add(30, 'generator'); break;
            default:
                // v6.88.1: an unrecognised type scores 0, and a pool of three
                // unknowns ties at 0 — the sort then hands the pick to card 0,
                // which is indistinguishable from a blind click. That is how
                // "clicking random items" would look if the game ever renamed
                // a type. It cannot be scored blind, but it must not be silent.
                if (type && !UNKNOWN_TYPES.has(type)) {
                    UNKNOWN_TYPES.add(type);
                    log('UNSCORED card type "' + type + '" (' + name + ') — picks in this family are arbitrary');
                }
                break;
        }

        // Enemy-adaptive bonuses: what we're actually fighting shapes what we
        // take. Heavy crowds make screen-wide specials worth more; a boss on
        // the field makes the ultimate worth more.
        if (type === 'sp_timestop' || type === 'sp_firecross')
            add(Math.round(30 * Math.min(1, enemyMix.total / 30)), 'crowd-adapt');
        if (type === 'ult' && enemyMix.boss > 0.5) add(40, 'boss-adapt');
        // Passouts keep spawning = loot piles waiting to be harvested — the
        // ultimate clears them wholesale (user strategy), and raw DPS cashes
        // them out too.
        // v6.85.10: the /3 ceiling meant a 20-passout floor scored identically
        // to a 3-passout floor — every passout-pressure signal in the scorer
        // saturates at 3, so the pick rules literally cannot see a backlog.
        // The ult is the designated passout clear (user), so it is the one that
        // should keep climbing with the pile.
        if (type === 'ult' && passoutAvg > 0.5) add(Math.round(10 + 22 * Math.min(1, passoutAvg / 8)), 'passout-farm');

        // The DPS race: enemies' HP and damage scale over the run. When our
        // measured kill rate falls behind the measured spawn pressure and
        // enemy toughness, shift picks hard toward damage and away from economy.
        const S = CONFIG.strategy;
        if (type === 'base' && !atCap) add(Math.round(0.8 * S.dpsDeficitGain * dpsDeficit), 'dps-race');
        if ((type === 'gold' || type === 'gen') && dpsDeficit > 0.2)
            add(-Math.round(15 * dpsDeficit), 'dps-first');
        // Economy mode: SALES is a scoring stat — but only farm it when
        // survival is secured (cruising, past the fragile early game).
        if ((type === 'gold' || type === 'gen') && dpsDeficit < 0.15 && gamePhase() !== 'early')
            add(10, 'economy-cruise');
        // CROWN ECONOMY: the ₩218.9M record is built on money multipliers.
        // Once the build is complete (6 supers or the Rainbow), gold and
        // generators become the primary scaling stat.
        if ((type === 'gold' || type === 'gen') && (rainbowThisRun || supersThisRun >= 6))
            add(25, 'crown-economy');

        const isCocktail = type === 'weapon' || COCKTAILS.includes(name);
        const isPassive = type === 'passive' || (!isCocktail && INGREDIENT_PRIORITY[name] != null);

        if (isCocktail && type !== 'evolve' && type !== 'super' && type !== 'rainbowup') {
            const phase = gamePhase();
            if (lv > 0 && !atCap) {
                // Owned: finishing a cocktail is a step toward its super — and
                // early on, leveling what we have is also the DPS that keeps
                // us alive. Progress compounds so near-done cocktails finish first.
                // (Maxed cards get NO progress bonus — they're dead picks.)
                {
                    const junkOwned = AVOID_COCKTAILS.has(name) && !PLAN_COCKTAILS.includes(name);
                    add(junkOwned ? Math.round((40 + lv * 6) * 0.2) : (40 + lv * 6), junkOwned ? 'progress(junk)' : 'progress');
                    // SUPER-SLOT THEFT (6.79): this banned cocktail's key is one
                    // of our own essentials, so maxing it WILL open a super and
                    // burn a slot the plan needs (MANHATTAN took NEGRONI's).
                    if (!CROWN && junkOwned && PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name]) &&
                        lv > 0 && lv < (cap || 6)) add(-45, 'slot-theft');
                }
                add(enemyContextBonus(name), 'enemy-adapt');
                if ((WEAPON_TAGS[name] || []).includes('defense'))
                    add(hellDetected ? 10 : (phase === 'early' ? 9 : 5), 'survival-kit');   // NEGRONI early = foundation
                // USER FORTRESS DOCTRINE: leveling NEGRONI's shield/dodge is
                // the early damage-reduction wall (with OLIVE) — never WATER
                if (name === 'NEGRONI' && phase === 'early' && !atCap) add(8, 'fortress');
                // SANDBOX LAB: NEGRONI's max-level shield BURNS (topped the
                // solo DPS table) and SOUTH SIDE is the bulk-clear king —
                // in a dense field, their levels are damage, not just utility.
                if (/^(NEGRONI|SOUTH SIDE)$/.test(name) && lv >= 3 && !atCap && enemyMix.total > 10)
                    add(6, 'lab-burn');
                if (phase === 'early') add(Math.round(CONFIG.strategy.earlyDps), 'early-dps');
                // minute-one sprint: the first attack upgrade must exist
                // before the first NO BOOKING wall (user directive)
                if ((typeof G.gameTime !== 'number' || G.gameTime < 120) && lv < 3) add(6, 'first-strike');
                add(Math.round(CONFIG.strategy.dpsDeficitGain * dpsDeficit), 'dps-race');
                if (enemyMix.boss > 0.5) add(8, 'boss-dps');   // boss on field: raw damage now
                const key = SUPER_KEY_INGREDIENT[name];
                if (key && isMaxed(key)) add(20, 'super-soon');
            } else if (lv === 0) {
                const S2 = CONFIG.strategy;
                if (ownedCocktailCount() === 0) {
                    // EARLY: the first weapon shapes the whole run — measured
                    // performance decides, with extra exploitation weight.
                    add(cocktailPriority(name) + 15, 'first-weapon');
                    if (PLAN_COCKTAILS.includes(name)) add(Math.round(S2.roadmapBonus), 'roadmap');
                    // substitute first pick with an in-plan super key (e.g.
                    // MOJITO when SUGAR is planned): rainbow potential intact
                    else if (!poolHasPlan && PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name])) add(10, 'plan-key-fallback');
                    add(buildUcb(name) * 1.5, 'build-history');
                } else {
                    let v = cocktailPriority(name) * 0.8;
                    // FALLBACK RAINBOW POTENTIAL: when the pool doesn't offer
                    // the prescribed build, prefer substitutes whose super key
                    // is ALREADY in our ingredient plan — a nearly-free extra
                    // super on the road to the gun.
                    if (!poolHasPlan && !PLAN_COCKTAILS.includes(name) && PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name]))
                        v += 10;
                    v += Math.round(enemyContextBonus(name) * 0.8);
                    if ((WEAPON_TAGS[name] || []).includes('defense'))
                        v += (hellDetected ? 8 : (phase === 'early' ? 7 : 4));   // NEGRONI early = foundation
                    if (PLAN_COCKTAILS.includes(name)) v += S2.roadmapBonus;   // on the rainbow roadmap
                    const key = SUPER_KEY_INGREDIENT[name];
                    const keyLv = ownedLevels[key] || 0;
                    if (keyLv > 0) v += 6 + keyLv * 2;       // its key ingredient is already invested
                    if (isMaxed(key)) v += 14;               // key done — this super is close
                    v -= 6 * unfinishedCocktails();          // focus pressure, not a wall
                    if (phase === 'early' && unfinishedCocktails() > 0) v -= 10;   // survive first, spread later
                    // LATE (day, not hell): a fresh Lv0 weapon can't reach Lv6
                    // before closing — dead weight unless its super is already
                    // one key away. In hell, levels flow fast; no penalty.
                    if (phase === 'late' && !hellDetected && !isMaxed(key)) v -= 14;
                    if (ownedCocktailBelow(S2.deepFocusLv))
                        v -= S2.expandPenalty * (PLAN_COCKTAILS.includes(name) ? 0.35 : 1);   // DEEP FOCUS — but the prescribed six must still arrive
                    // ROSTER-FILL (live audit: min 18, only 3/6 cocktails, one
                    // super): six supers need six cocktails EARLY. Pressure to
                    // complete the prescribed roster grows with the clock.
                    if (PLAN_COCKTAILS.includes(name) && ownedCocktailCount() < PLAN_COCKTAILS.length) {
                        const gtR = typeof G.gameTime === 'number' ? G.gameTime : 0;
                        v += Math.min(22, 6 + Math.round(gtR / 90));
                    }
                    add(v, 'new-cocktail');
                    add(buildUcb(name), 'build-history');    // learned: which cocktails win runs
                }
            }
        } else if (isPassive) {
            add(ingredientPriority(name), 'ingredient');
            add(ingredientContextBonus(name), 'purpose');
            add(evolutionSynergy(name), 'craft-synergy');
            if (name === 'ANGOSTURA' && (rainbowThisRun || supersThisRun >= 6)) add(12, 'crown-economy');
            if (name === 'TOMATO JUICE' && hellDetected) add(6, 'ult-uptime');
            // COFFEE BEANS = the revive. Wasted early (a fresh run costs
            // nothing), precious late/hell where one death ends a crown bid.
            if (name === 'COFFEE BEANS') {
                const ph = gamePhase();
                add(ph === 'early' ? -6 : (ph === 'mid' ? 6 : 14), 'revive-timing');
                if (hellDetected) add(8, 'revive-hell');
            }
            // key-ingredient value: every owned cocktail waiting on this ingredient
            let kv = 0;
            for (const ck of COCKTAILS) {
                if (SUPER_KEY_INGREDIENT[ck] !== name) continue;
                const cklv = ownedLevels[ck] || 0;
                if (cklv > 0) kv += 10 + cklv * 3;
                if (cklv >= (ownedMax[ck] || 6)) kv += 22;   // cocktail done → maxing this unlocks its super
            }
            add(kv, 'super-key');
            if (hellDetected && supersThisRun < 6 && kv > 0) add(12, 'rainbow-rush');
            if ((enemyMix.boss > 0.5 || hellDetected || enemyMix.total > 12) && VERSATILE_INGREDIENTS.includes(name))
                add(8, 'versatile');   // MINT upgrades shred crowds and mobile bosses
            if (ITEM_FINDER_INGREDIENTS.includes(name)) add(6 + (hellDetected ? 4 : 0), 'item-finder');
            // (NEGRONI's matching fortress bonus lives in the weapon branch)
            // USER DIRECTIVE: OLIVE (armor x2) is the TOP priority pick of
            // the first phase — runs are dying early for lack of defense.
            // Applies once a weapon exists (something must still deal damage).
            if (name === 'OLIVE' && gamePhase() === 'early' && ownedCocktailCount() >= 1 && !isMaxed('OLIVE'))
                add(26, 'olive-first');
            // v6.86.2 (user: "that was a bad run as I didn't get olives
            // early"). For a TANK the armour lines are not just survival —
            // they are the licence for everything else the character does:
            // the caution discount, the holdout anchor, and standing in the
            // ult window all key off OLIVE + NEGRONI levels. Armour bought at
            // minute 2 compounds for the whole run; the same level at minute
            // 20 buys almost nothing. So the premium is largest at t=0 and
            // decays to nothing by the finale, and it spans the whole day
            // rather than stopping at the 'early' bucket's 6-minute edge.
            // v6.86.5: TOMATO JUICE cuts the ult cooldown (player.ultCdMul).
            // The two demos differ by exactly this: demo 1 took it four times
            // and fired every 75s; demo 2 skipped it and fired every 98s —
            // 14 casts versus 12 over the same 20 minutes. For a bartender
            // whose passout economy IS the ultimate, cooldown is throughput.
            if (charOf().style === 'tank' && name === 'TOMATO JUICE' && !atCap) add(14, 'tank-ult-cadence');
            if (charOf().style === 'tank' && (name === 'OLIVE' || name === 'NEGRONI') && !atCap) {
                const gtA = typeof G.gameTime === 'number' ? G.gameTime : 0;
                const decay = Math.max(0, 1 - gtA / 1200);
                if (decay > 0) add(Math.round(30 * decay), 'tank-armor-early');
            }
            if (SURVIVAL_INGREDIENTS.includes(name)) {
                let sb = 10;
                // SOURCE-VERIFIED SCALING: enemy hp/dmg grow CONTINUOUSLY
                // with gameTime (gameTime/60, /90, /180 factors; NO BOOKING
                // walls at 42x base hp) — the defense the build needs is a
                // function of the clock. When armor/HP levels fall behind
                // the minute hand, survival picks jump the queue.
                const gtd = typeof G.gameTime === 'number' ? G.gameTime : 0;
                const defLv = (ownedLevels['OLIVE'] || 0) + (ownedLevels['SWEET VERMOUTH'] || 0) + (ownedLevels['NEGRONI'] || 0);
                if (defLv < Math.min(12, Math.floor(gtd / 120))) sb += 12;   // behind the curve
                // USER STRATEGY: early mob damage is LOW — armor/HP bought now
                // is cheap to establish and compounds for the whole run.
                // Foundation first, DPS second.
                if (gamePhase() === 'early') sb += 12;
                else sb += 8;                                          // defense still compounds later
                if (hellDetected) sb += 10;                            // hell: armor is king
                if (lastDeathCause === 'contact' || lastDeathCause === 'proj') sb += 8;   // dying to damage: buy armor
                add(sb, 'survival-kit');
            }
            // OLIVE IS THE SURVIVAL KING (user, restated): armor outranks
            // every other ingredient consideration — craft pressure, slot
            // pressure, drop rate, all of it. Nothing displaces it.
            // (gated on owning a weapon: armor on a bot that cannot kill
            // anything just delays the same death)
            if (name === 'OLIVE' && !atCap && ownedCocktailCount() >= 1) add(30, 'survival-king');

            // THE ESSENTIAL SIX (user, with their stated roles):
            //   TOMATO JUICE  ult cooldown  -> more invincibility windows
            //   SUGAR         item drop rate -> the consumable economy
            //   OLIVE         armor          -> raw survival
            //   CRANBERRY     pickup radius  -> drops reach us mid-rush
            //   SWEET VERMOUTH max HP        -> the buffer MINGUK lacks
            //   DRY VERMOUTH  crit + BLACK VERMOUTH craft -> frees a slot
            if (name === 'SWEET VERMOUTH' && !atCap)
                add(14 + (hellDetected ? 4 : 0), 'essential-hp');
            if (name === 'TOMATO JUICE' && !atCap)
                add(16 + (hellDetected ? 6 : 0) + (lastDeathCause === 'contact' || lastDeathCause === 'proj' ? 4 : 0), 'essential-ult');
            // DRY VERMOUTH: crit now, and fusing with SWEET frees a slot for
            // the ingredients the plan still needs.
            if (name === 'DRY VERMOUTH' && !atCap) add(12, 'essential-crit');
            // CRANBERRY (user-verified): expands the loot PICKUP RADIUS —
            // every kill pays more gold/XP with zero detour cost. Compounds
            // hardest when the field is rich with passout/wall loot.
            if ((INGREDIENT_TAGS[name] || []).includes('magnet'))
                add(6 + (passoutAvg > 1 ? 5 : 0) + Math.round(4 * dpsDeficit), 'loot-radius');
            // CRAFT PAIRS (user): SWEET+DRY VERMOUTH -> BLACK VERMOUTH and
            // SUGAR+WATER -> SIMPLE SYRUP. Each fusion consumes two slots and
            // returns one, freeing space for CAMPARI / TOMATO JUICE / the
            // rest of the essentials — so the nearer a pair is to completing,
            // the more urgent its remaining half becomes.
            if (!atCap) {
                for (const pair of CRAFT_PAIRS) {
                    if (!pair.includes(name)) continue;
                    const partner = pair[0] === name ? pair[1] : pair[0];
                    const pl = ownedLevels[partner] || 0;
                    if (pl <= 0) break;                      // partner not started: no craft pressure yet
                    const partnerCap = ownedMax[partner] || 6;
                    // slot pressure: a crowded ingredient bar makes fusing urgent
                    const slots = Object.keys(ownedLevels).filter(k => INGREDIENT_TAGS[k]).length;
                    const pressure = slots >= 8 ? 10 : slots >= 6 ? 5 : 0;
                    // partner already maxed = THIS card is the last step
                    if (pl >= partnerCap) {
                        // (6.79) a full bar makes the freed slot the point of the pick
                        const full = !CROWN && Object.keys(ownedLevels).filter(k => INGREDIENT_TAGS[k]).length >= 9;
                        add(26 + pressure + (full ? 14 : 0), 'craft-finish');
                    }
                    else add(8 + Math.round(pl * 2.5) + pressure, 'craft-pair');
                    break;
                }
                // SLOT ECONOMY: a craftable ingredient hands its slot back on
                // fusion; a terminal one holds it forever. When the bar is
                // filling — and especially during the first 20 minutes, when
                // the whole build still has to fit — a NEW terminal ingredient
                // pays a slot cost the craftable ones do not.
                {
                    const slots = Object.keys(ownedLevels).filter(k => INGREDIENT_TAGS[k]).length;
                    const craftable = CRAFT_PAIRS.some(pr => pr.includes(name));
                    const dayNow = !hellDetected && (typeof G.gameTime !== 'number' || G.gameTime < 1200);
                    if (lv === 0 && !craftable && slots >= 6 && !PLAN_INGREDIENTS.includes(name))
                        add(-(dayNow ? 12 : 8), 'slot-cost');
                }
            }
            // SUGAR: luck drives every consumable drop the stall build lives
            // on (time stops, flame crosses, tequila heals).
            if (name === 'SUGAR' && !atCap) add(16, 'drop-rate');
            // CRANBERRY: the pickup radius that makes those drops reachable
            // mid-rush — the other half of the same economy.
            if (name === 'CRANBERRY' && !atCap) add(14, 'pickup-radius');
            // CRANBERRY x SUGAR (user): cranberry's pickup radius hoovers the
            // tequila/heal drops that sugar's luck creates — during a mob
            // rush that pair IS the healing. Each amplifies the other.
            if (/^(CRANBERRY|SUGAR)$/.test(name) && !atCap) {
                const partnerLv = ownedLevels[name === 'CRANBERRY' ? 'SUGAR' : 'CRANBERRY'] || 0;
                add(8 + Math.min(8, partnerLv * 2) + (th_nearRef.v >= 5 ? 4 : 0), 'cranberry-sugar');
            }
            if (CROWN) {
                // CROWN RULES (6.74): CAMPARI's DOUBLE ROLE — shreds mob AND
                // boss defense, and it is SUPER NEGRONI's evolution key. With
                // NEGRONI in hand it advances both at once.
                if (name === 'CAMPARI' && (ownedLevels['NEGRONI'] || 0) > 0 && !atCap)
                    add(12, 'negroni-key-double');
            } else {
                // 6.79 RULES — CAMPARI, SOURCE-VERIFIED:
                //   player.enemyDefDown = pas.enemydef            (0.08 / level)
                //   player.campariR     = (110 + lv*16) * sizeMul * 0.6
                //   dealDmg: if dist(e, player) < campariR  ->  dmg *= 1 + enemyDefDown
                // A RADIUS-GATED flat damage multiplier: x1.48 at Lv6, inside
                // ~124px. DIFF() grows enemy HP x1.4 every 180s forever while
                // our damage is fixed — so x1.48 buys only ~3.5 minutes of kill
                // window. Worth a lot in the day, ~nothing in late hell where
                // its 124px payout radius sits INSIDE the giants' contact ring.
                if (name === 'CAMPARI' && !atCap) {
                    if (hellDetected) add(-6, 'campari-late-decay');
                    else add(12 + (th_nearRef.v >= 5 ? 4 : 0), 'campari-shred');
                }
            }
            if (PLAN_INGREDIENTS.includes(name)) add(Math.round(CONFIG.strategy.roadmapBonus * 0.8), 'roadmap');   // double-counts: super key + craft part
            if (name === 'ABSINTHE' && !(ownedLevels['CORPSE REVIVER NO.2'] > 0)) add(-6, 'absinthe-trap');
        } else if (score === 0) {
            add(12, 'unknown');
        }

        // LINEBACKER COUNTER (user directive): while charge lanes are on the
        // field, homing and directed weapons — which track the charger even
        // off-screen — are the kill tools. Kiting keeps us alive; these kill.
        if (lastPlan && lastPlan.lines > 0 && (type === 'weapon' || type === 'super') && !atCap &&
            (WEAPON_TAGS[name] || []).some(t => ['homing', 'boss', 'sustained', 'sniper'].includes(t)))
            add(8, 'linebacker-counter');

        // SIEGE TOOLS (user directive): DIRECTED attacks — VODKA MARTINI's
        // gatling line above all, plus sniper/sustained patterns — are what
        // melt NO BOOKING walls and passout fields. When those targets are
        // on the field, directed weapons jump the queue. (Ultimates serve
        // the same purpose — handled in maybeAbilities: ult fires on walls,
        // bosses, and passout clusters when available.)
        const siegeField = (lastPlan && (lastPlan.wallNear === true || (lastPlan.passoutsNear || 0) >= 1)) || passoutAvg > 1;
        // USER: VODKA MARTINI + DRY MARTINI are the MAIN directed attacks on
        // passouts whenever the ultimate and flame cross aren't available.
        if (siegeField && (type === 'weapon' || type === 'super') && !atCap &&
            (/VODKA\s*MARTINI|DRY\s*MARTINI/i.test(name) || (WEAPON_TAGS[name] || []).some(t => ['sustained', 'sniper'].includes(t))))
            add(9, 'siege-tools');

        // USER PRIORITY ORDER: the two martinis lead the cocktail queue —
        // their directed/orbit fire is the passout-clearing backbone.
        if (type === 'weapon' && /^(VODKA|DRY)\s*MARTINI$/i.test(name) && PLAN_COCKTAILS.includes(name) && !atCap) add(8, 'martini-first');   // dormant unless the martinis are in the plan
        // USER EARLY DOCTRINE (live failure: early passives starved DPS and
        // passouts survived): weapons come FIRST in the early game. The ONLY
        // passives worth early slots are OLIVE > DRY VERMOUTH > SWEET
        // VERMOUTH, in that order — every other passive yields to any live
        // weapon/base/ult option in the same pool.
        if (type === 'passive' && gamePhase() === 'early') {
            // USER: OLIVE and NEGRONI are the best survival picks of the
            // first 20 minutes — armor and the dodge-shield are what carry a
            // thin MINGUK frame to the finale.
            // USER ORDER: OLIVE first for survival, then BOTH vermouths early
            // — fusing them into BLACK VERMOUTH frees the slot that SUGAR,
            // TOMATO JUICE and CAMPARI still need.
            if (name === 'OLIVE') add(20, 'early-rank-1');
            else if (name === 'DRY VERMOUTH') add(14, 'early-rank-2');
            else if (name === 'SWEET VERMOUTH') add(12, 'early-rank-3');
            else {
                const weaponAlt = Array.isArray(poolArr) && poolArr.some(c => {
                    const t = String((c && c.type) || '').toLowerCase();
                    if (!['weapon', 'base', 'ult'].includes(t)) return false;
                    const n = baseNameOf(c);
                    const clv = levelOf(c), ccap = maxLevelOf(c);
                    if (clv > 0 && ccap && clv >= ccap) return false;
                    return t !== 'weapon' || !AVOID_COCKTAILS.has(n);
                });
                if (weaponAlt) add(-14, 'weapons-first');
            }
        }

        // COCKTAILS-LEAN (user): between a roster cocktail and a key
        // ingredient in the same pool, the weight leans to the COCKTAIL —
        // except OLIVE, DRY VERMOUTH, SUGAR, and SWEET VERMOUTH, which keep
        // full weight (armor, crit, mojito key + luck, HP + the extra slot).
        if (type === 'passive' && !atCap &&
            !/^(OLIVE|DRY VERMOUTH|SUGAR|SWEET VERMOUTH)$/.test(name) &&
            Array.isArray(poolArr) && poolArr.some(c => {
                const t = String((c && c.type) || '').toLowerCase();
                const n = baseNameOf(c);
                const clv = levelOf(c), ccap = maxLevelOf(c);
                if (clv > 0 && ccap && clv >= ccap) return false;
                return t === 'weapon' && PLAN_COCKTAILS.includes(n);
            })) add(-8, 'cocktails-lean');

        // ROSTER-FIRST (user): a NEW roster cocktail in the level-up screen
        // outranks weapon-leveling — in EVERY phase, not just hell — unless
        // the pool's only alternatives are junk. New cocktails exist only
        // here; levels also flow from boss tips (especially in hell).
        if (ownedCocktailCount() < PLAN_COCKTAILS.length && type === 'weapon' && !atCap) {
            const rainbowPath = PLAN_COCKTAILS.includes(name) || PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name]);
            if (lv === 0 && rainbowPath && !AVOID_COCKTAILS.has(name)) add(hellDetected ? 30 : 24, 'roster-first');
            else if (lv > 0 && !/^★?\s*SUPER\b/i.test(name) &&
                Array.isArray(poolArr) && poolArr.some(c => {
                    const t = String((c && c.type) || '').toLowerCase();
                    const n = baseNameOf(c);
                    return t === 'weapon' && levelOf(c) === 0 && !AVOID_COCKTAILS.has(n) &&
                        (PLAN_COCKTAILS.includes(n) || PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[n]));
                })) add(-15, 'level-later');   // only when the pool actually OFFERS a new roster cocktail
        }

        // USER: NEGRONI is the LAST roster cocktail to JOIN in the first 20
        // minutes — damage cocktails first; the shield arrives by late day
        // (and hell-prep then rushes its super before the finale).
        if (type === 'weapon' && name === 'NEGRONI' && (ownedLevels[name] || 0) === 0 &&
            CONFIG.rainbowPolicyOverride !== 'skip' &&   // stall builds want the shield-burn ASAP
            ownedCocktailCount() >= 1 && !hellDetected &&
            (typeof G.gameTime !== 'number' || G.gameTime < 300)) add(-12, 'negroni-later');

        // USER OPENERS: VODKA MARTINI or MOJITO should be in hand EARLY —
        // their directed/sniper fire is what converts the first NO BOOKING
        // walls, bosses, and passouts into loot before the build matures.
        if (type === 'weapon' && /^(VODKA\s*MARTINI|MOJITO|SOUTH\s*SIDE|VODKA\s*TONIC)$/i.test(name) &&
            PLAN_COCKTAILS.includes(name) && !atCap &&
            gamePhase() === 'early' && (ownedLevels[name] || 0) === 0) add(14, 'opener');

        // MINGUK CORE (user): the stall build's pillars — maxed SOUTH SIDE
        // burn, NEGRONI shield-burn, OLIVE armor — take priority over the
        // rest of the roster.
        if (!atCap && ((type === 'weapon' && /^(SOUTH SIDE|NEGRONI)$/.test(name)) ||
            (type === 'passive' && /^(OLIVE|SWEET VERMOUTH|DRY VERMOUTH)$/.test(name)))) add(10, 'minguk-core');
        // v6.85.0 MITIGATION TILT: DIFF() proves damage is flat from minute 10,
        // so deep hell is won by HP, armor, shield and ult uptime. A tank
        // bartender leans harder into exactly those cards.
        if (charOf().mitigationTilt && !atCap && (
            (type === 'passive' && /^(OLIVE|SWEET VERMOUTH|TOMATO JUICE)$/.test(name)) ||
            (type === 'weapon' && name === 'NEGRONI') || type === 'ult'))
            add(charOf().mitigationTilt, 'tank-mitigation');
        // KNOCKBACK TO LEVEL 6 (v6.84.0 — the measured lever). VODKA CRANBERRY
        // and MOSCOW MULE gain their shove at Lv6 with NO super required, and
        // between them they are the primary of four of the all-time top runs
        // (255:48 included). Contact ends ~67% of runs, so a knockback
        // cocktail one or two levels short of 6 is the most valuable weapon
        // card on the board.
        if (type === 'weapon' && !atCap && /VODKA\s*CRANBERRY|MOSCOW\s*MULE/i.test(name) && lv >= 1 && lv < 6) {
            const near6 = lv >= 4 ? 14 : (lv >= 3 ? 8 : 4);   // closer to the shove = worth more
            const ctx = (hellDetected ? 10 : 0) +
                (lastDeathCause === 'contact' ? 8 : 0) +
                (enemyMix.boss > 0.5 ? 6 : 0);
            add(12 + near6 + ctx, 'knockback-to-6');
        }

        // WHISKY SOUR (user): the freeze beam pins bosses — a stopped boss
        // deals no contact damage, so it is a DEFENSIVE pick, valued higher
        // whenever bosses are the live threat.
        // v6.91.4 THE FREEZE IS WORTH WHAT IT IS SCARCE (user: "crucial when
        // time pause is not available"). The flat +12 could not move a pick: an
        // ingredient scores ~65 and a new cocktail opens around +12, so the
        // bonus was decorative in the exact regime the user is describing.
        //
        // Two multipliers, both keyed to that sentence:
        //   SCARCITY — measured pause uptime across this run's hell ticks. If the
        //     field is stopped often, TIME STOP is doing the job and WHISKY SOUR
        //     is redundant. `pauseShareRun()` is null before ~5s of hell samples,
        //     and null is treated as SCARCE on purpose: hell entry is where no
        //     evidence exists yet and where the user says the pick decides runs.
        //   PHASE — doubled through the hell-entry window. The median run is
        //     1325s against a 1200s entrance, so this is where runs are lost, and
        //     it is also where armour has not capped and a boss hit is lethal.
        // Hell-only for the same reason: the day has bosses, but not the ones
        // that one-hit a bot whose armour has not capped.
        if (!atCap && hellDetected && /WHISKY\s*SOUR/i.test(name)) {
            const shareW = pauseShareRun();
            const scarce = (shareW == null) ? 1 : Math.max(0, 1 - shareW);
            const gtW = typeof G.gameTime === 'number' ? G.gameTime : 0;
            const entryW = hellDetected && gtW < (CONFIG.deepHell.freezeEntryToS || 2400);
            add(Math.round(22 * (0.3 + 0.7 * scarce) * (entryW ? 2 : 1)), 'freeze-scarce');
        }

        // =============================================================
        // v6.88.4 PHASE ORDER (user: "the ordering of everything matters")
        // =============================================================
        // DAY: take the plan in the stated order, ingredients before cocktails.
        // The bonus is deliberately large — an ordering that has to argue with
        // the old weights is not an ordering. It decays 7 per rank so the list
        // is strictly monotonic, and it applies only while the plan is still
        // being assembled.
        const gtOrd = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const dayBuild = !hellDetected && gtOrd < 1200;
        if (dayBuild && !atCap) {
            const rank = DAY_ORDER.indexOf(name);
            // FIRST ATTEMPT USED 130 - rank*7 AND DID NOT WORK: the residual
            // terms (super-line 54, boss-killer 50, progress 46, survival-kit
            // 30 ...) span ~150 points, so a 7-point step per rank was noise
            // against them and SOUTH SIDE came out 3rd instead of 12th. For an
            // ORDER to actually hold, the step between adjacent ranks must
            // exceed the whole spread of everything else. 200 does; anything
            // in the list therefore beats anything below it, always.
            // v6.88.6 — 200 PER RANK WAS WRONG, AND THE RUNS SAID SO.
            // It made the order lexicographic: nine ingredients had to reach
            // Lv6 before a single cocktail was taken (OLIVE lv5 scored 3722
            // against an unowned SOUTH SIDE at 1620), which is more picks than
            // a day contains. supersPerRun fell 1.9-2.1 -> 1.1 at n=10.
            //
            // Worse, it broke the SAFETY layer. gun-guard is -500 and the
            // rainbow ban is -1000; against a +3400 rank bonus both are noise,
            // so cards that open a sixth super line stopped being refused and
            // runs drifted toward the Rainbow Gun — which replaces the base
            // attack with something weaker and ends the run, especially with
            // NEGRONI's shield still unbuilt because it ranks 16th.
            //
            // An order has to be a strong PREFERENCE that loses to a veto, not
            // a priority that outranks one. Capped at 200 total so every guard
            // in the scorer still dominates it.
            if (rank >= 0) add(200 - rank * 11, 'day-order' + (rank + 1));
            // =========================================================
            // v6.107.0 THE ARMOUR TIER IS TIME-GATED
            // =========================================================
            // User's stated phasing, verbatim: "(1) Mojito, gin tonic, vodka
            // tonic, southside, ultimate, shaking up as the first picks for
            // damage to survive the initial 5 minutes. (2) olives, sweet
            // vermouth, sugar, negroni for armor in 5-10 minutes."
            //
            // The day order is STATIC — it reads the same at gt 0 as at gt
            // 1199 — so phase 2 did not exist. Scored against a fresh build at
            // 6.7 min the ranking came out ULTIMATE 785, STIRRING 531, OLIVE
            // 373, SOUTH SIDE 359: the armour anchor was the third pick of the
            // run and ahead of every cocktail, from second one.
            //
            // This is a SUPPRESSION with an expiry, not a reordering: before
            // `armorTierFromS` the armour ingredients give up part of their
            // rank bonus, and after it they get all of it back. Deliberately
            // NOT a veto — a pool that offers nothing else must still be
            // takeable, which is why it subtracts a bounded amount instead of
            // refusing the card.
            // 6.105.0's entry-armour checkpoint (+18 from 750s, +40 from
            // 1050s) is untouched and lands long after this expires, so
            // armour is still capped before the 1200s entrance.
            // (no `!hellDetected` here: the enclosing `dayBuild` guard is
            // already `!hellDetected && gtOrd < 1200`. Writing it again read
            // as a second safeguard and was dead code — teeth-verified by
            // deleting it and watching nothing fail. The hell exemption is
            // real, it just lives one block up, and `armor-tier` guards it
            // there as an invariant.)
            const armorFrom = CONFIG.movement.armorTierFromS;
            if (rank >= 0 && armorFrom != null && gtOrd < armorFrom &&
                ARMOR_TIER.has(name)) {
                add(-(CONFIG.movement.armorTierHold != null ? CONFIG.movement.armorTierHold : 60),
                    'armor-tier-hold');
            }
            // v6.88.6 SLOT LOCKOUT (user): "the choices become limited towards
            // building a rainbow gun as the game was designed that way ...
            // allowing the bot to fill the cocktail space earlier in the run
            // when choices aren't limited may be one way to permanently lock
            // out rainbow gun."
            //
            // This is the right shape of fix, and it is structural rather than
            // a veto. Late in a run the pool narrows until every cocktail on
            // offer walks a gun line — sometimes only two choices — so REFUSING
            // is not available by then. But a slot that is already occupied
            // cannot be filled by a card, so the gun line is closed by
            // OCCUPANCY instead of by scoring. The window to do that is early,
            // while the pool is still wide.
            //
            // So: until every plan cocktail is claimed (lv >= 1), an unclaimed
            // one outranks the whole ingredient order. Levelling can wait; the
            // slot cannot. Once all are claimed this term switches off and the
            // stated order governs again.
            const claimed = PLAN_COCKTAILS.filter(c => (ownedLevels[c] || 0) > 0).length;
            const slatFull = claimed >= PLAN_COCKTAILS.length;
            if (!slatFull && type === 'weapon' && lv === 0 && PLAN_COCKTAILS.includes(name)) {
                // v6.89.0 (user, on the two 6.88.6 runs that died at 596s and
                // 484s without reaching hell): +250 put an unclaimed cocktail
                // above the ENTIRE survival order — OLIVE, the vermouths, WATER
                // — so the early picks bought seven level-1 weapons and no
                // armour. The lockout is still right; its price was being paid
                // out of the day phase's survival budget.
                //
                // +60 keeps the claim ahead of levelling something already
                // claimed and ahead of every junk card, while OLIVE (200),
                // DRY VERMOUTH (189) and BLACK VERMOUTH (178) still outrank an
                // unclaimed SOUTH SIDE (112 + 60 = 172). The slots still fill
                // early — just not before the bot can survive to use them.
                add(60, 'slot-claim' + (claimed + 1) + '/' + PLAN_COCKTAILS.length);
            }
            // TWO THINGS SIT ABOVE THE WHOLE LIST, and both are the user's own
            // doctrine rather than an exception to it:
            //   the ULTIMATE — "ultimates used to kill passouts as priority for
            //     early loot and reward upgrades". The day IS the funding phase.
            //   SHAKING UP (base attack) — super evolution requires "base attack
            //     MAX + cocktail Lv6 + key ingredient MAX". Rank the base below
            //     seventeen other cards and NO super ever evolves, which would
            //     silently delete the four-line plan the order exists to build.
            if (type === 'ult') add(240, 'day-ult-first');
            else if (type === 'base') add(220, 'day-base-second');
            // v6.94.2 (user): "early upgrades to ultimate are key". The demo
            // digest shows why in numbers: pat's ult DOUBLES per level
            // (dmg*9.6*2^(lv-1)) while passout HP is priced at landing time —
            // lv2 arrived at gt 505 and by gt 600 the piles had outgrown the
            // cast (poHpAfter > poHpBefore from gt 656). At +240 the ult card
            // LOST to OLIVE (402) whenever both were offered. Until lv3 it
            // outranks everything; from lv3 the armor doctrine resumes.
            // v6.111.0 THE PREMIUM NOW REACHES LV6, where the evidence is.
            //
            // The old rule stopped dead at lv3 — "until lv3 it outranks
            // everything; from lv3 the armor doctrine resumes" — and the pat
            // demos measure the run's single biggest difference on the far
            // side of that line. Demos 1 and 2 are the same character, same
            // length, same day: demo 2 reached ult lv6 by 14:52 and wiped
            // million-HP passout fields outright (3->0, 4->0); demo 1 reached
            // lv5 at 18:17 and its lv1-3 casts only chipped fields of 3 down
            // to 1. Passouts piling to 24 on the floor was a SYMPTOM of the
            // low ult level, not a movement failure.
            //
            // And for the two invulnerability ults the level buys uptime
            // directly: joe's aura window is 8+0.8*(lv-1) s against a fixed
            // ULT_CD of 80 s, so lv1 -> lv6 is 10% -> 15% invulnerable, a 50%
            // increase in the only resource that makes standing in a crowd
            // survivable. Cadence cannot buy that — the bot is already firing
            // near cooldown (measured median inv 0.103 against a 0.10-0.15
            // ceiling). The window can.
            //
            // Entries 0-2 hold the old +200 exactly, so nothing below lv3
            // changes; the decaying tail is the new part, and it decays
            // because the armour doctrine it competes with is not wrong,
            // just not the whole story.
            if (type === 'ult') {
                const uLv = safe(() => player.ultLevel, 0) || 0;
                const sched = (CONFIG.abilities && Array.isArray(CONFIG.abilities.ultSpineByLv))
                    ? CONFIG.abilities.ultSpineByLv : [200, 200, 200];
                const bonus = uLv < sched.length ? sched[uLv] : 0;
                if (bonus > 0) add(bonus, 'ult-spine-lv' + uLv);
            }
        }
        // HELL: the plan is BUILT. The job is no longer to assemble it but to
        // avoid opening the six-maxed-super Rainbow Gun gate, so the safe junk
        // the user named becomes a real pick rather than a last resort.
        if (hellDetected && !atCap && HELL_SAFE_JUNK.includes(name)) {
            add(26, 'hell-safe-junk');
        }
        // v6.89.0 SURVIVAL CORE (user: "black vermouth and tomato juice are
        // also very important like olives", "especially when it reaches the 30
        // to 50 minute marks").
        //
        // This is a TIER above the day order, not a place in it. Demoting the
        // slot-claim to +60 was not enough on its own: an unclaimed SOUTH SIDE
        // still scored 359 against OLIVE's 322, because a cocktail collects
        // half a dozen other bonuses an ingredient never sees. The three cards
        // a run cannot survive without have to be lifted, not the cocktail
        // shaved — otherwise every future cocktail bonus quietly re-opens the
        // same hole.
        //
        // The 30-50 minute window (1800-3000s) is where the user watches runs
        // die: the tip window is closing, boss rings are widening, and a run
        // that is short an orbit or short ult uptime has no way back. The boost
        // roughly doubles there.
        if (!atCap && SURVIVAL_CORE.includes(name)) {
            const gtSc = typeof G.gameTime === 'number' ? G.gameTime : 0;
            const crunch = gtSc >= 1800 && gtSc <= 3000;
            add(crunch ? 150 : 80, crunch ? 'survival-core-crunch' : 'survival-core');
        }
        // MOSCOW MULE: off the plan, never sought, but safe to eat when the
        // pool offers nothing better. Its key (GINGER BEER) is banned for good
        // as of v6.88.5, so it cannot open a sixth super line no matter when it
        // is taken. Small and positive: it must lose to every planned card and
        // to the hell-safe junk, and beat only true junk.

        // =============================================================
        // v6.88.3 USER DOCTRINE, from the live 373-minute Pat run
        // =============================================================
        // Four super lines only (SOUTH SIDE / VODKA TONIC / GIN TONIC /
        // MOJITO). Everything below earns its slot on raw effect instead.
        //
        // "whisky sour, negroni, vodka cranberry should be massively boosted
        // despite not having super key" — all three sat at Lv6 in that run and
        // none of them supered. WHISKY SOUR's LEMON and NEGRONI's CAMPARI are
        // off-plan; VODKA CRANBERRY's key is planned as a STAT (pickup radius),
        // not as a super path.
        // v6.91.5: WHISKY SOUR joins this list on the same terms as NEGRONI —
        // no hell gate, because the freeze has to be IN HAND before the 1200s
        // entrance, and a hell-only boost would delay acquisition to exactly
        // after the point it is needed.
        //
        // RETRACTED MID-BUILD: I first restricted this to hell, on the reading
        // that the boost inverted the day order (WHISKY SOUR 201 vs VODKA TONIC
        // 172, NEGRONI 168). Those numbers came from the `freeze-slot` scenario,
        // whose env sets hell:true — they were never day numbers. In a real day
        // scene the order is SOUTH SIDE 359, NEGRONI 276, VODKA TONIC 263,
        // WHISKY SOUR 226: last among the planned cocktails, exactly as its
        // roadmap rank intends. There was no inversion to fix, and the "fix"
        // would have delayed the pick past the phase it exists for.
        if (!atCap && type === 'weapon' && KEYLESS_BOOST.includes(name)) {
            add(46 + (hellDetected ? 20 : 0), 'keyless-core');
        }
        // v6.95.2 ENTRY-REGEN CHECKPOINT: the proven deep seat runs on armor
        // AND regen (park gates on regenRate >= 1.0), but only armor had a
        // late-day checkpoint. If measured regen is behind by late day, WATER
        // (and the SIMPLE SYRUP it crafts into) jumps the queue so the park
        // gates pass at entry instead of forty minutes into hell.
        {
            const gtR = typeof G.gameTime === 'number' ? G.gameTime : 0;
            // ── v6.112.0 PRICED BY HP/s, AND AGAINST THE RIGHT BAR ─────────
            //
            // USER: "normal mob damage can be absorbed and countered with
            // simple syrup's healing regen rate." Two corrections follow.
            //
            // (1) THE BAR. The checkpoint fired while regen < 1.0, the old
            // park gate — which is BELOW break-even. At armour cap the
            // 38-frame invuln caps contact at 1.579 hits/s x 1 damage, so the
            // anchor needs 1.579 HP/s to hold. Stopping the checkpoint at 1.0
            // stopped it 0.58 HP/s short and handed the seat a build that
            // loses slowly. parkAudit's seated median regen is 1.42: the runs
            // that DID park were, at the median, still underwater.
            //
            // (2) THE INGREDIENT. Both cards paid a flat +16, and they are not
            // worth the same: SIMPLE SYRUP is 0.512 HP/s per level against
            // WATER's 0.284 — 1.8x. Joe has ZERO innate regen, so every point
            // comes from these two, and the difference is break-even at
            // SIMPLE SYRUP 4 versus WATER 6 (the entire cap, for less). The
            // bonus is now proportional to the HP/s the level actually buys.
            //
            // WATER keeps a real bonus rather than being demoted: it is half
            // of the SUGAR+WATER craft that MAKES simple syrup, so starving it
            // starves the better card. That is also why DAY_ORDER puts it at 8
            // and SIMPLE SYRUP at 9 — a prerequisite, not a preference.
            // ── v6.114.0 THE DAY IS AN HP ECONOMY, AND IT IS NEGATIVE ───────
            //
            // The first live 6.113.0 report carried the income audit, and its
            // first bucket settles what the day actually is:
            //
            //   0-10 min   loss 1.27/s   gain 1.00/s   net -0.27 HP/s
            //   10-20 min  loss 3.34/s   gain 2.57/s   net -0.77 HP/s
            //   20-30 min  loss 6.50/s   gain 5.02/s   net -1.48 HP/s
            //   firstNegativeMin: 20 (reported) — but bucket ZERO is already
            //   negative, and every bucket after it is too.
            //
            // Joe's pool is 100 HP. At -0.27 HP/s a full pool drains in 370 s,
            // and the day-death rows cluster at 360-1100 s. The day is not
            // being lost to a movement mistake; it is being lost to arithmetic.
            // The audit's own note says so: "no posture fixes that, only heal
            // income or time-stop uptime."
            //
            // One level of SIMPLE SYRUP is +0.512 HP/s and flips bucket zero
            // POSITIVE on its own. The checkpoint that buys it did not open
            // until gt 600 — i.e. after the entire first bucket had already
            // been spent bleeding. That gate is the bug.
            //
            // Two changes, and the second matters more than the first:
            //   1. Opens at `regenFromS` (120 s: after the first weapon, so the
            //      opening sprint still funds itself) instead of 600.
            //   2. The bonus is now proportional to the DEFICIT — how far below
            //      break-even the current regen is — rather than a flat +16
            //      that never came close to outbidding a base-attack card at
            //      560. At zero regen it pays `strategy.regenDeficit`, decaying
            //      to nothing as break-even is reached, so it stops bidding the
            //      moment the economy is solved rather than pouring the whole
            //      day into WATER.
            //
            // The size of that bonus is a genuine trade-off — every pick spent
            // on regen is a pick not spent on the super line, and supersPerRun
            // 0.5 against a supersMin of 3 is the OTHER binding constraint. I
            // do not know the right number, so it is a TUNABLE dimension and
            // the search settles it. That is the honest form of this change.
            const REGEN_PER_LV = { 'SIMPLE SYRUP': 0.512, 'WATER': 0.284 };
            const regenFromS = CONFIG.deepHell.regenFromS != null ? CONFIG.deepHell.regenFromS : 120;
            // ── v6.118.0 THE REGEN CARD WAS A BID, AND BIDS DO NOT WIN ────────
            //
            // USER, on a live minute-76 run: "the only issue is that it didn't
            // pick up water for hp regen and it will eventually die." The
            // manual digest of that run settles it beyond argument:
            //
            //     final: def 35, ultLv 6, supers 5, regen 0
            //     weapons: gintonic 6, olive 6, bloodymary 6, tonic 6,
            //              southside 6, dryver 6, negroni 6, cranberry 6,
            //              tomato 6, sugar 6, mojito 6, mint 6, sweetver 6,
            //              vodkatonic 6, moscowmule 6
            //     passives: {}
            //
            // FIFTEEN cards at level 6 and not one point of regen, at minute
            // 76. This is not the picker preferring something marginally
            // better — it is the regen card losing every single contest for
            // seventy-six minutes.
            //
            // Two reasons, both structural rather than a matter of degree:
            //
            //  1. THE BID WAS 16 POINTS. A weapon level-up scores progress+70
            //     and up. The project has now measured three times that a
            //     preference competing inside the gain sum does not move the
            //     bot (6.89.11's dormant pull, 6.107.0's drop anchor, the
            //     6.111.0 lane exit — "127 px in 120 minutes"). The deficit
            //     term that was supposed to carry it is `strategy.regenDeficit`,
            //     which the search has driven to a LIVE VALUE OF 0.
            //
            //  2. `!hellDetected` CLOSED IT AT HELL ENTRY. A run that reaches
            //     1200 s with zero regen can never fix it, no matter how many
            //     of the next 75 minutes it survives. The run above had 57
            //     minutes of hell and could not buy a single WATER.
            //
            // So regen stops being a bid and becomes a SPINE, the same shape as
            // `ult-spine`: while regen is below the seat's own floor
            // (deepHell.parkRegenRate), a regen card is a prerequisite and
            // outscores the roster. It decays to nothing the moment the floor
            // is met, so it cannot pour a whole run into WATER, and it pays
            // BOTH cards identically — DAY_ORDER still decides between them,
            // which is the 6.114.0 retraction and `slot-lockout` still holds it.
            //
            // And it runs in hell. That is the half that matters for a run
            // already at minute 76 with nothing.
            // ── v6.119.0 THE SPINE RUNS IN THE DAY TOO ────────────────────────
            //
            // 6.118.0 scoped it to hell because `slot-lockout` said WATER at 479
            // outranked every super key. That guard has now been revised to the
            // user's own doctrine (see DAY_ORDER in 01) — TONIC is demoted, MINT
            // leads — so the collision it was protecting no longer exists in the
            // form it was written for.
            //
            // And the hell-only scoping does not work, which the first batch
            // shows plainly. `regen` is now the LARGEST seat-miss bucket at 33%
            // (armour fell 20% -> 2% and yield 24% -> 6%, so this is what was
            // underneath), while entrySurvival is 0.40: SIXTY PERCENT of hell
            // entrants die within 300 s of the entrance. A spine that only opens
            // at hell entry has a couple of hundred seconds and one or two
            // level-ups to fix an economy the whole day was needed to build.
            // The rows say it did not: def 35 / regen 0 for 15,073 ticks,
            // def 23.3 / regen 0 for 1,414, def 35 / regen 0.57 for 4,084.
            //
            // So it opens at regenFromS (120 s) in both phases. The syrup guard
            // below still keeps the craft behind its halves.
            //
            // The historical note, kept because it is the reason this was ever
            // hell-only: the first draft reddened both guard invariants at once:
            //     {tonic:262, mint:278, sugar:273, dry:247, sweet:271, water:479}
            //     sugar 273  syrup 469
            // WATER at 479 outranks every super KEY, and SIMPLE SYRUP outranks
            // SUGAR — its own craft ingredient, which is the exact 6.112.0
            // mistake in a new costume. WATER already scores ~239 against a key
            // band of 247-278, so in the day there is no room for a premium at
            // all: anything above +8 breaks the super lines, and supersPerRun
            // 0.4 against a supersMin of 3 says those are not spare capacity.
            //
            // The user's reading — "water instead of tonic could have been a
            // better early pick" — is a real claim about the day, and it
            // collides head-on with that ordering. It is a trade-off, not a
            // bug, so it is not resolved here by fiat; the day keeps its
            // existing bid and the question goes back to the user.
            //
            // What IS unambiguous is hell. The reported run had FIVE supers and
            // fifteen cards at level 6 — the super lines were not the binding
            // constraint there, regen 0 was — and `!hellDetected` meant 57
            // minutes of hell could not buy a single WATER. That is the half
            // this ships.
            // v6.120.0: hell-only again. The day spine shipped in the same
            // version as the re-rank, so the two are confounded in a z=-2.49
            // regression; both go back and the day side is re-tried alone.
            if (!atCap && type === 'passive' && REGEN_PER_LV[name] != null &&
                hellDetected && gtR >= regenFromS) {
                const floorR = CONFIG.deepHell.parkRegenRate != null ? CONFIG.deepHell.parkRegenRate : 1.0;
                const haveR = regenRate();
                // SIMPLE SYRUP is the WATER + SUGAR craft: it may only take the
                // spine once both halves are maxed and the craft is actually
                // available, or the premium walks it in front of its own
                // ingredients again.
                const syrupBlocked = name === 'SIMPLE SYRUP' &&
                    !((ownedLevels['WATER'] || 0) >= 6 && (ownedLevels['SUGAR'] || 0) >= 6);
                if (haveR < floorR && floorR > 0 && !syrupBlocked) {
                    const spine = (CONFIG.abilities && CONFIG.abilities.regenSpine != null)
                        ? CONFIG.abilities.regenSpine : 240;
                    const short = Math.max(0, Math.min(1, (floorR - haveR) / floorR));
                    add(Math.round(spine * short), 'regen-spine(' + Math.round(short * 100) + '%short)');
                }
            }
            if (!atCap && type === 'passive' && REGEN_PER_LV[name] != null &&
                !hellDetected && gtR >= regenFromS) {
                // null = armour unreadable; fall back to the old flat bar
                // rather than to a threshold nothing can meet.
                const be = contactBreakEven();
                const need = be == null ? 1.0 : be;
                const have = regenRate();
                if (have < need) {
                    // v6.114.0 RETRACTION. 6.112.0 scaled this by HP/s per
                    // level so SIMPLE SYRUP (0.512) outbid WATER (0.284)
                    // outright. That is right on regen arithmetic and WRONG on
                    // craft mechanics: SIMPLE SYRUP is the WATER + SUGAR craft,
                    // and DAY_ORDER deliberately ranks it after both halves
                    // (WATER 8, SUGAR 3). Opening the checkpoint at 120 s made
                    // the conflict live and `slot-lockout` caught it — the two
                    // cards came out 319 / 322, syrup ahead of its own
                    // ingredient. The per-level split is withdrawn; DAY_ORDER
                    // decides between the two regen cards, and the deficit term
                    // lifts BOTH equally. The user's point stands (syrup is the
                    // better regen source); it is expressed by the day order
                    // already putting them adjacent, not by outbidding the
                    // prerequisite.
                    const perLv = 16;
                    // ...and add the deficit term on top: full weight at zero
                    // regen, zero weight once break-even is reached.
                    const deficit = Math.max(0, Math.min(1, (need - have) / need));
                    const k = CONFIG.strategy.regenDeficit != null ? CONFIG.strategy.regenDeficit : 0;
                    add(perLv + Math.round(k * deficit),
                        'entry-regen-' + (name === 'SIMPLE SYRUP' ? 'syrup' : 'water') +
                        (deficit > 0 ? '(' + Math.round(deficit * 100) + '%short)' : ''));
                }
            }
            // ── v6.123.0 ENTRY-REGEN CHECKPOINT ────────────────────────────
            //
            // The block above is a BID and the CEM is walking it to zero
            // (`strategy.regenDeficit` mean 17.82 -> 20.05 -> 11.36 across
            // gens 737/740/741; the same state paid +59 at n=61 and +24 at
            // n=70). This is the same lever expressed as a GATE instead, held
            // outside CEM control, exactly as `entry-armor` below is.
            //
            // The evidence it answers, 6.122.0 n=79: `parkMiss.regen` is 45.3%
            // of seat-miss ticks, and parkAudit's two groups differ on regen
            // ALONE — seated 2.0, never-parked 0, both at medianEntryDef 35.
            // Runs entering under `deepHell.parkRegenRate` park for zero
            // seconds regardless of how long they survive. It is a threshold.
            //
            // Tagged `park-regen`, not `entry-regen-*`: the older tag belongs
            // to the CEM-scaled bid above and the two must stay separable in
            // a pick log, or the next batch cannot tell which one paid.
            //
            // Four constraints, each of which is a tooth in
            // test/scenario.js `park-regen`:
            //   1. It gates on the MEASURED stat (regenRate() reads
            //      player.regenBonus), never on ownedLevels['WATER'] — the
            //      lesson the entry-armor bar learned when `< 30` worked only
            //      by coincidence of OLIVE 5 vs OLIVE 6.
            //   2. The bar is read from `deepHell.parkRegenRate`, never a
            //      hardcoded 1.0, so it cannot drift away from the gate it
            //      exists to pass. (parkAudit's toFixed(1) once produced an
            //      unreachable defMin of 35; this is that mistake's shape.)
            //   3. It is INDEPENDENT of `strategy.regenDeficit`. Set that dim
            //      to 0 and the checkpoint still fires — that independence is
            //      the entire point of the change, so it is asserted directly.
            //   4. It RELEASES above the bar: at regen >= parkRegenRate it
            //      contributes exactly 0. Without that it becomes the TIME
            //      STOP failure mode — a flat premium that keeps paying long
            //      after the thing it buys has stopped being worth anything.
            //
            // Level-ups are scored here too: `name` is the base name for a
            // level-up card as much as a new one, and the ladder stalls at
            // WATER 2 (0.568), two levels short of the 1.136 that clears 1.0.
            // A checkpoint that only bought first picks would fix nothing.
            if (!atCap && type === 'passive' && REGEN_PER_LV[name] != null && !hellDetected) {
                const barR = CONFIG.deepHell.parkRegenRate != null ? CONFIG.deepHell.parkRegenRate : 1.0;
                const nowR = regenRate();
                // Same craft guard as the spine: SIMPLE SYRUP may not jump in
                // front of its own ingredients (the 6.112.0/6.114.0 mistake).
                const syrupHeld = name === 'SIMPLE SYRUP' &&
                    !((ownedLevels['WATER'] || 0) >= 6 && (ownedLevels['SUGAR'] || 0) >= 6);
                if (nowR < barR && barR > 0 && !syrupHeld) {
                    const late = CONFIG.movement.entryPrepFromS != null ? CONFIG.movement.entryPrepFromS : 1050;
                    const early = CONFIG.movement.entryRegenFromS != null ? CONFIG.movement.entryRegenFromS : 750;
                    const wLate = (CONFIG.abilities && CONFIG.abilities.entryRegen != null)
                        ? CONFIG.abilities.entryRegen : 90;
                    const wEarly = (CONFIG.abilities && CONFIG.abilities.entryRegenEarly != null)
                        ? CONFIG.abilities.entryRegenEarly : 45;
                    if (gtR >= late) add(wLate, 'park-regen');
                    else if (gtR >= early) add(wEarly, 'park-regen-early');
                }
            }
            // v6.99.2 ENTRY-ARMOR CHECKPOINT (funnel n=240: 35 entrants, 31
            // dead in entry at median def 29.2 — the parkAudit seat bar is
            // 35). The fund rush buys tempo; from entryPrepFromS this
            // converts late-day picks back into the armor the seat needs.
            // 30 is the park gate the never-parked group sat just under.
            // v6.105.0 TWO TIERS, and the bar is now the CEILING not the
            // park gate. `< 30` worked only by coincidence (OLIVE 5 = 29.16
            // is under it, OLIVE 6 = 34.992 is over), which breaks the moment
            // any other armour source exists; 34.9 says what is meant. The
            // early tier is the real fix — see movement.entryArmorFromS.
            if (!atCap && name === 'OLIVE' && !hellDetected && (liveDefense() || 0) < 34.9) {
                if (gtR >= (CONFIG.movement.entryPrepFromS != null ? CONFIG.movement.entryPrepFromS : 1050)) {
                    add(40, 'entry-armor');
                } else if (gtR >= (CONFIG.movement.entryArmorFromS != null ? CONFIG.movement.entryArmorFromS : 750)) {
                    add(18, 'entry-armor-early');
                }
            }
        }
        // v6.95.1 (joe doctrine): joe has NO innate regen — NEGRONI's
        // regenerating shield is his regen substitute, and in the 6.94.1 pat
        // digest the roster's NEGRONI arrived at gt 752. Joe cannot wait 12
        // minutes for his only sustain. Joe-only, day-weighted.
        if (!atCap && type === 'weapon' && name === 'NEGRONI' && activeChar === 'joe' && !hellDetected) {
            add(26, 'joe-shield');
        }
        // v6.99.3 (user): "gin and tonic can attack passouts and should be
        // used as a boss killer since it slows the bosses from doing contact
        // damage." GIN TONIC was ranked purely as one of the four super
        // lines; its SLOW is a mitigation tool — a slowed boss lands fewer
        // contact ticks (contact is 66% of all HP ever lost), and the
        // projectile hits passouts. Day-weighted: the day boss roster is
        // where the slow buys the most (the demo's "full kill of day
        // bosses"); in hell the freeze tools (WHISKY SOUR, TIME STOP) own
        // that job.
        if (!atCap && type === 'weapon' && name === 'GIN TONIC') {
            add(!hellDetected ? 24 : 10, 'gin-boss-slow');
        }
        // v6.92.3 — THE MULE LOCKOUT (user, stating a game-design rule):
        // "a character cannot get moscow mule if the character has vodka cherry
        // and vice versa". The two are MUTUALLY EXCLUSIVE.
        //
        // That turns MOSCOW MULE from a neutral occupant into an active
        // DEFENCE. VODKA CRANBERRY is the most dangerous latent line on the
        // board — its super key CRANBERRY is a PLAN_INGREDIENT the build MUST
        // max for pickup radius, so unlike GIMLET or MANHATTAN its key is
        // armed by the plan's own success and the arming cap cannot touch it.
        // Taking the mule closes that line PERMANENTLY, by the game's own rule
        // rather than by our scoring winning a bidding war in a narrow pool.
        //
        // This is the rainbow-lockout doctrine exactly: occupancy beats
        // vetoing, and it only works while the pool is still wide. So the
        // bonus is DAY-weighted and switches off the moment either card is
        // owned — once the exclusion has resolved there is nothing left to buy.
        if (!atCap && type === 'weapon' && name === 'MOSCOW MULE' &&
            !(ownedLevels['MOSCOW MULE'] || 0) && !(ownedLevels['VODKA CRANBERRY'] || 0)) {
            add(hellDetected ? 18 : 45, 'mule-lockout');
        }
        // the four keyed lines sit ABOVE the keyless three by construction
        if (!atCap && type === 'weapon' && SUPER_LINE_COCKTAILS.includes(name)) {
            add(54 + (hellDetected ? 20 : 0), 'super-line');
        }
        // "olive, black vermouth, and simple syrup is now a top priority",
        // "along with tomato juice", "cranberry as well", "mint as well".
        // OLIVE is armour; TOMATO JUICE is ult throughput (demo 1: taken 4x,
        // cast every 75 s vs 98 s without); CRANBERRY is the pickup radius that
        // makes drops reachable while anchored; MINT is move speed AND the
        // mark-escape margin. The two crafts are pure upside — applyCraft keeps
        // the materials at full level with their stats still applying and only
        // frees the slot count.
        // ── v6.119.0 A CRAFT RESULT DOES NOT COLLECT THIS UNTIL IT IS REAL ──
        //
        // Both craft RESULTS (BLACK VERMOUTH, SIMPLE SYRUP) are on this list and
        // none of their four halves are, so the result collected +38 that its own
        // ingredients did not. The old day order hid that behind six ranks of
        // separation (SUGAR 3 vs SIMPLE SYRUP 9 = 66 points at the 11-per-rank
        // step, comfortably over the 38). The 6.119.0 re-rank puts them two
        // ranks apart — 22 against 38 — and `slot-lockout` caught it instantly:
        //
        //     sugar 273   syrup 273
        //
        // A TIE with its own ingredient, which is the 6.112.0 mistake yet again,
        // and the third distinct route into it. Rather than re-tune the ranks
        // until the arithmetic happens to work, remove the cause: a craft result
        // is not a "top ingredient" while it cannot be crafted. The bonus
        // arrives with the craft, and the halves lead until then — which is what
        // the comment above already claims ("a craft is only reachable if both
        // materials reach Lv6"). This holds under ANY future reorder.
        const craftUnmade = (() => {
            for (const c of EVOLUTIONS) {
                if (c.result !== name) continue;
                return c.parts.some(p => (ownedLevels[p] || 0) < 6);
            }
            return false;
        })();
        if (!atCap && type === 'passive' && TOP_INGREDIENTS.includes(name) && !craftUnmade) {
            add(38 + (hellDetected ? 14 : 0), 'top-ingredient');
        }
        // ...and the four halves that BECOME those crafts inherit the priority,
        // since a craft is only reachable if both materials reach Lv6.
        if (!atCap && type === 'passive' && CRAFT_HALVES.includes(name)) {
            add(34, 'craft-half');
        }
        // "lime, soda water can be junk pool picks": above true junk, below
        // anything planned. Only pays when the pool has nothing better.
        if (!atCap && JUNK_ACCEPTABLE.includes(name)) add(6, 'junk-acceptable');
        // "tonic can be priority if it helps in day phase" (user). It does, and
        // more than the phrasing suggests: TONIC is the SHARED key for two of
        // the four super lines (VODKA TONIC and GIN TONIC), so one ingredient
        // buys half the super plan. The boost is day-weighted because that is
        // when the lines are being assembled; in hell it reverts to its normal
        // plan value.
        //
        // ── v6.121.0 THE RANK NEVER BOUND, AND THE PICKS AUDIT PROVED IT ────
        //
        // 6.120.0 pinned an OPEN finding in `slot-lockout`: TONIC is DAY_ORDER
        // rank 1 and is scored FIFTH. Measured at gt 500, level 0:
        //   OLIVE 373 > MINT 278 > SUGAR 273 > SWEET VERMOUTH 271 > TONIC 262
        // The rank ladder pays 11 points a step; SWEET VERMOUTH stacks 92 points
        // of premium on its rank (craft-half 34, survival-kit 30, essential-hp
        // 14, minguk-core 10, tank-mitigation 4) against this term's 32. 55
        // points of rank lead lose to a 60-point premium gap.
        //
        // The 6.120.0 batch's OWN picks audit is the confirmation, not a model:
        // DRY VERMOUTH taken at gt 375 (309), SWEET VERMOUTH at gt 414 (345),
        // MINT at gt 424 — and TONIC not taken at all through gt 524. Both
        // vermouths bought before the rank-1 card, in a real run.
        //
        // 32 -> 70 puts TONIC at ~300: above SWEET 271, SUGAR 273 and MINT 278,
        // still well below OLIVE 373. OLIVE leading is left alone deliberately —
        // it is armour, it is the user's own doctrine ("olives are essential for
        // defense"), and medianEntryDef is now 35, at the cap.
        //
        // BE HONEST ABOUT WHAT THIS IS. 6.106.0 promoted TONIC to rank 1 and
        // measured well, but the rank never actually bound, so every result
        // since has been produced by the EFFECTIVE order with TONIC fifth. This
        // is therefore a genuine experiment on something never in force — not a
        // repair of a regression. It ships ALONE for exactly that reason.
        if (!atCap && name === 'TONIC') {
            const gtTon = typeof G.gameTime === 'number' ? G.gameTime : 0;
            add((!hellDetected && gtTon < 1200) ? 32 : 12, 'tonic-two-lines');
        }

        // ABSOLUTE PRIORITY (user): SOUTH SIDE and MINT lead everything below
        // the ultimate and SHAKING UP — the burn engine and its super key.
        // USER: SOUTH SIDE is THE weapon — nothing but the ultimate and the
        // base attack outranks it (MINT rides with it as its super key).
        if (!atCap && /SOUTH\s*SIDE/i.test(name)) {
            add(40, 'absolute-priority');
            // v6.88.3 (user): "southside is essential to killing bosses". It is
            // the only body-centred burn zone in the plan, and the zone damage
            // predicate (hypot(e.x-z.x, e.y-z.y) < z.r + e.r) means it lands on
            // a boss's HITBOX circle rather than needing the centre — which is
            // why it works on paused bosses at a 150 px station where nothing
            // else reaches. Its lead over the keyless three must not be
            // marginal: the first measurement had it at 151 vs NEGRONI's 136.
            add(28 + (enemyMix.boss > 0.3 || (lastPlan && lastPlan.boss) ? 22 : 0), 'boss-killer');
        }
        if (!atCap && name === 'MINT') {
            add(24, 'absolute-priority');
            // v6.88.2 MARK ESCAPE (see MARK_CLEAR_PX in 01): a character whose
            // base speed cannot clear a 0.6 s / 70 px mark is buying survival
            // here, not mobility. Pat is 1.6 px short per frame; the runners
            // already clear it and get nothing. Scaled by how short they are,
            // so the rule stays honest if the character table ever changes.
            const spd = charOf().speed || 2.4;
            const shortfall = Math.max(0, MARK_CLEAR_PX - spd * MARK_TELE_FRAMES);
            if (shortfall > 0) {
                add(Math.min(30, Math.round(shortfall * 1.6)) + (hellDetected ? 8 : 0), 'mark-escape');
            }
            // CROWN RULES (6.74): SOUTH SIDE finished and only MINT stands
            // between us and its super — the single most valuable ingredient
            // state in the build.
            if (CROWN && (ownedLevels['SOUTH SIDE'] || 0) >= (ownedMax['SOUTH SIDE'] || 6)) add(20, 'unlocks-super-southside');
        }
        // (6.79) LAST STEP TO A PLAN SUPER: a finished plan cocktail waiting
        // only on this ingredient. Slots are capped at five, so every one
        // must go to a cocktail we actually chose (CAMPARI -> SUPER NEGRONI,
        // MINT -> SUPER SOUTH SIDE), never to a banned line.
        if (!CROWN && type === 'passive' && !atCap && PLAN_INGREDIENTS.includes(name)) {
            for (const ck of PLAN_COCKTAILS) {
                if (SUPER_KEY_INGREDIENT[ck] !== name) continue;
                if ((ownedLevels[ck] || 0) >= (ownedMax[ck] || 6)) { add(26, 'unlocks-plan-super'); break; }
                if ((ownedLevels[ck] || 0) >= 4) { add(12, 'plan-super-soon'); break; }
            }
        }
        // (v6.82.0's fifth-super bonuses removed in v6.84.0 — 112 runs showed
        // supersPerRun unmoved at 1.4-1.6 and the two best runs ever finishing
        // with THREE supers. Super COUNT does not produce depth; see the
        // knockback rule above, which is what the top runs actually share.)
        // survival pair, day phase: armor + shield before anything optional
        if (!atCap && !hellDetected && (typeof G.gameTime !== 'number' || G.gameTime < 1200) &&
            (name === 'OLIVE' || name === 'NEGRONI')) add(14, 'survival-pair');
        // ENDGAME ENGINE (user): SOUTH SIDE is what kills paused bosses —
        // late day and all of hell, its levels/super/key outrank the rest.
        if (!atCap && (hellDetected || (typeof G.gameTime === 'number' && G.gameTime > 900)) &&
            (/SOUTH\s*SIDE/i.test(name) || name === 'MINT')) add(16, 'endgame-southside');

        // SPAWN-PREP (source timetable): a boss class unlocks within 35s —
        // boss-purpose weapons and raw damage jump the queue NOW.
        if (upcomingBossUnlock()) {
            if (type === 'weapon' && (WEAPON_TAGS[name] || []).some(t => ['boss', 'sniper', 'homing', 'burst'].includes(t)) && !atCap)
                add(8, 'spawn-prep');
            if (type === 'passive' && (INGREDIENT_TAGS[name] || []).includes('dps') && !atCap)
                add(6, 'spawn-prep');
        }

        if (CROWN) {
            // v6.94.2 — THE 6.74 HELL-PREP BLOCK IS DEAD, and it was the gun
            // leak. It paid +14 NEGRONI / +20 CAMPARI / +30 for the SUPER
            // NEGRONI card — actively walking the line the whole lockout
            // doctrine forbids. This is HOW the live run evolved NEGRONI
            // (audit A2), and it is what the user was watching: "the bot
            // seems to be picking up upgrades for rainbow gun more often."
            // NEGRONI is a KEYLESS occupant by doctrine (its key CAMPARI is
            // arming-capped and avoid-listed since 6.92.0); the refusal that
            // guarded exactly this sat in the OTHER profile's dead branch.
            // Hoisted here so the live branch refuses it too.
            if (type === 'super' && /NEGRONI/i.test(name)) add(-400, 'negroni-super-noop');
        } else {
            // 6.79 RULES — SOURCE-VERIFIED (read live from the game's
            // fireCocktail / recalcStats / hurtPlayer):
            //   * NEGRONI has NO projectile case at all — fireCocktail('negroni')
            //     falls straight through to break. The super multiplier P only
            //     exists inside fireCocktail, so EVOLVING NEGRONI CHANGES NOTHING.
            //   * Its whole effect is recalcStats:
            //       shieldMax = negLv > 0 ? round((20 + negLv*14) * 1.3) : 0
            //     driven by player.weapons.negroni ONLY — superLv is never read.
            //   * hurtPlayer: shieldMax > 0 gives a flat 8% total-negate roll, and
            //     any shield absorb sets invuln = 38 frames.
            // So a SUPER NEGRONI card is a pure no-op that ALSO burns one of the
            // five capped super slots and pushes the 6-super rainbow gate. Refuse
            // it outright. NEGRONI *levels* stay valuable (shield HP).
            if (type === 'super' && /NEGRONI/i.test(name)) add(-400, 'negroni-super-noop');
            if (!hellDetected && gamePhase() !== 'early') {
                if (type === 'weapon' && name === 'NEGRONI' && !atCap) add(14, 'hell-prep');
                // CAMPARI keeps its own merit (pas.enemydef) — no longer justified
                // as NEGRONI's evolution key, so the bonus is trimmed.
                if (type === 'passive' && name === 'CAMPARI' && !atCap) add(12, 'hell-prep');
            }
        }

    // Is this card the final step of a 2-part fusion (partner already maxed)?
    function isCraftFinish(type, name) {
        if (type !== 'passive') return false;
        for (const pair of CRAFT_PAIRS) {
            if (!pair.includes(name)) continue;
            const partner = pair[0] === name ? pair[1] : pair[0];
            const pl = ownedLevels[partner] || 0;
            if (pl > 0 && pl >= (ownedMax[partner] || 6)) return true;
        }
        return false;
    }

    // live super count straight from the game (superLv keys with any level)
    function liveSuperCount() {
        try {
            const sl = G.player && G.player.superLv;
            if (!sl || typeof sl !== 'object') return supersMade.size;
            return Object.values(sl).filter(v => typeof v === 'number' && v > 0).length;
        } catch (e) { return supersMade.size; }
    }
    // Would taking THIS card open a new super line we don't already have?
    const CAP_LINES = () => CONFIG.maxSuperLines || 4;
    function opensNewSuperLine(type, name) {
        try {
            const sl = (G.player && G.player.superLv) || {};
            const has = c => {
                const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                return Object.keys(sl).some(s2 => s2.toLowerCase().replace(/[^a-z0-9]/g, '') === k && sl[s2] > 0);
            };
            if (type === 'weapon') {
                if (!COCKTAILS.includes(name) || has(name)) return false;
                return keyEffectivelyMaxed(SUPER_KEY_INGREDIENT[name]);   // key already maxed (or absorbed): this completes it
            }
            if (type === 'passive') {
                for (const c of COCKTAILS) {
                    if (SUPER_KEY_INGREDIENT[c] !== name) continue;
                    if (has(c)) continue;
                    if ((ownedLevels[c] || 0) >= (ownedMax[c] || 6)) return true;   // cocktail done, this key finishes it
                }
            }
        } catch (e) { }
        return false;
    }


    // GUN-GUARD (user: junk pool is free as long as no rainbow): the
        // gate is six MAXED supers — so the SIXTH super unlock card is the
        // one pick that can ever endanger the stall doctrine. At five
        // supers, any further super card is refused outright.
        {
            const CAP = CAP_LINES();
            const nSupers = Math.max(supersMade.size, liveSuperCount());
            // the sixth super IS the gun — refuse the unlock card...
            if (type === 'super' && nSupers >= CAP) add(-500, 'gun-guard');
            // ...and refuse anything that would OPEN a sixth line in the
            // first place (user: block it when picking weapons/ingredients).
            if (nSupers >= CAP && (type === 'weapon' || type === 'passive') &&
                opensNewSuperLine(type, name)) add(-500, 'gun-guard-source');
            // v6.92.0 THE ARMING CAP — the CAMPARI/LIME hole, closed.
            // Both guards above are gated on `nSupers >= CAP`, so they say
            // nothing while the count is still climbing. That is exactly when
            // a junk key gets maxed: the live run read campari 6 / lime 6 with
            // GIMLET and NEGRONI already evolved and nSupers only at 5.
            // This fires at ANY super count, because arming a line the plan
            // never wanted is never right — and only on the final level, so
            // the junk tier keeps working up to Lv5.
            if (armsLineNow(type, name, lv, cap)) add(-700, 'arming-cap');
            // v6.89.0 LATENT LINE — the MANHATTAN hole, closed.
            // An off-plan cocktail whose super key is ALREADY satisfied (maxed,
            // or maxed-then-absorbed by a craft) is not a gun risk that grows
            // with picks: it is a sixth super line that needs nothing but
            // levels in the cocktail itself. The guards above only fire at the
            // cap or on the completing pick, both of which arrive too late —
            // by then the slot is spent and the pool has narrowed. Refuse it at
            // level ZERO, at any super count. Opening the line is the mistake;
            // everything after it is just paying for the mistake.
            //
            // -600 at lv 0 sits below the rainbow ban's own -500s, so a pool
            // offering nothing but latent lines still resolves rather than
            // deadlocking; -400 once it is already owned keeps feeding it worse
            // than eating junk, without pretending the slot can be un-spent.
            if (type === 'weapon' && COCKTAILS.includes(name) && !PLAN_COCKTAILS.includes(name)) {
                const lkey = SUPER_KEY_INGREDIENT[name];
                const sl2 = (G.player && G.player.superLv) || {};
                const k2 = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
                const already = Object.keys(sl2).some(s3 =>
                    s3.toLowerCase().replace(/[^a-z0-9]/g, '') === k2 && sl2[s3] > 0);
                // v6.89.1 — CAUGHT LIVE, AND 6.89.0 WOULD HAVE MISSED IT.
                // A 6.88.6 console log shows MANHATTAN taken at lv0 for a score
                // of 41 out of a junk pool (against ANGOSTURA 8, LEMON 8,
                // SIDECAR -22), levelled 114 -> 120 -> 126, and evolved:
                // "★ SUPER MANHATTAN UP(super)=338". The gun guard only woke up
                // afterwards, scoring the same card -322 once the line existed.
                //
                // 6.89.0 keyed the veto on the super key being ALREADY maxed.
                // At the moment that MANHATTAN was taken it was not — so the
                // veto stayed silent and the line opened anyway.
                //
                // The missing half: THE PLAN MAXES ITS OWN INGREDIENTS. SWEET
                // VERMOUTH is a craft half; BLACK VERMOUTH cannot be made
                // without taking it to Lv6. So MANHATTAN is a latent sixth line
                // from turn one, not from the moment the key tops out. Six
                // off-plan cocktails are latent by exactly this construction —
                // MANHATTAN (sweet vermouth), VODKA MARTINI (dry vermouth),
                // WHISKEY HIGHBALL (water), DRY MARTINI (olive), BLOODY MARY
                // (tomato juice), ESPRESSO MARTINI (coffee beans) — and the
                // measured rows are full of runs built on them.
                //
                // A cocktail keyed to an ingredient the plan intends to max is
                // a sixth super waiting for levels. Refuse it at level zero,
                // from the first pool, before the slot is spent.
                const planWillMax = lkey && PLAN_INGREDIENTS.includes(lkey);
                // =====================================================
                // v6.110.0 — THE VETO WAS FIRING AT ZERO SUPERS.
                // =====================================================
                // The user's own 79-minute joe recording took COSMOPOLITAN as
                // the FIRST pick of the run, VODKA CRANBERRY four times to
                // lv4 (gt 393/408/582/637), GIMLET at 1002 and VODKA MARTINI
                // at 1092 — and finished with FOUR supers, never near the gun.
                // Every one of those is refused here today: VODKA CRANBERRY's
                // key is CRANBERRY, which IS in PLAN_INGREDIENTS, so
                // `planWillMax` fires and the card scores -600 at lv0.
                //
                // The rule is right about the mechanism and wrong about WHEN.
                // A sixth line needs six MAXED supers. At gt 393 the human had
                // ZERO supers — the line was many picks away and the run
                // needed damage, which is what those cocktails are. 6.87.4
                // already recorded this once ("minguk's best recent runs are
                // built on exactly those — DRY MARTINI, VODKA CRANBERRY,
                // COSMOPOLITAN") and relaxed the gun-path tax below halfway;
                // 6.89.0 then re-refused the same cards from a different
                // direction, and nobody noticed the two rules disagreed.
                //
                // So the veto now waits until the super count is actually near
                // the cap. Below that the card is judged on merit. NOTHING at
                // the dangerous end changes: `gun-guard` (-500 on the sixth
                // super card), `gun-guard-source` (-500 on anything opening a
                // line at the cap), `arming-cap` (-700 on the key's final
                // level, at ANY count) and `gun-path-complete` (-500) all
                // still stand, and those are the guards that actually execute.
                // A LEVEL CEILING rides along as belt-and-braces: the human's
                // own ceiling was lv4, and a latent cocktail parked below
                // evolution range cannot become a super however the key moves.
                // THE LOAD-BEARING GUARD IS NOW THE LEVEL CEILING, and it is
                // strictly stronger than what it replaces. A super needs the
                // cocktail MAXED and its key maxed. The MANHATTAN incident
                // 6.89.0 was built on ran exactly that course: taken at lv0 out
                // of a junk pool, levelled 114 -> 120 -> 126, evolved. Capping
                // the cocktail below evolution range makes that course
                // impossible at ANY super count and however the key moves —
                // whereas the old lv0 veto only made it unlikely, and 6.87.4
                // had already relaxed a sibling rule for the same cards.
                // The old veto is KEPT at the dangerous end: near the cap the
                // card is refused at every level, exactly as before.
                const nearCap = nSupers >= CAP - 1;
                const lvlCeil = CONFIG.gunSafeOffPlanLv != null ? CONFIG.gunSafeOffPlanLv : 4;
                if (lkey && !already && (keyEffectivelyMaxed(lkey) || planWillMax)) {
                    if (nearCap) add(lv === 0 ? -600 : -400, planWillMax ? 'latent-line-planned' : 'latent-line');
                    else if ((lv || 0) >= lvlCeil) add(-600, 'latent-line-ceiling');
                }
            }
            // v6.89.0 SLOT WASTERS (user: old fashioned / corpse reviver out of
            // the junk pool). A cocktail slot is the lockout's currency; these
            // two buy nothing with it.
            if (type === 'weapon' && lv === 0 &&
                SLOT_WASTERS.includes(name) && !PLAN_COCKTAILS.includes(name)) {
                add(-300, 'slot-waster');
            }
            // v6.87.2: the same refusal one step earlier and independent of the
            // count — a card that COMPLETES a line outside the planned five is
            // a sixth line by construction, because the roster only ever holds
            // five. Waiting for nSupers to reach the cap let the pool hand us
            // the sixth line while we were still at four.
            if ((type === 'weapon' || type === 'passive') && !atCap) {
                const risk = gunPathProgress(type, name);
                if (risk >= 0.999) add(-500, 'gun-path-complete');
                // ...and BELOW that, ordering rather than vetoing. When the
                // pool is all junk the bot must still take something; it should
                // take the junk that does NOT walk toward the gate.
                //
                // v6.87.4 CORRECTION, from the first measured 6.87.3 runs:
                // supers/run fell 3.2 -> 0.5 and hell rate 1.0 -> 0.5 (n=5 and
                // n=4, so weak evidence, but the MECHANISM is not in doubt).
                // 6.87.2 taxed EVERY off-plan line from its very first level,
                // and minguk's best recent runs are built on exactly those —
                // DRY MARTINI, VODKA CRANBERRY, COSMOPOLITAN. Two levels in an
                // off-plan cocktail is damage, not a gun path: it cannot become
                // a super without many more picks, and the -500 above catches
                // the pick that would actually finish it.
                // So the tax now starts only past the HALFWAY mark, where a
                // line is genuinely in danger of completing, and climbs steeply
                // from there. Below half, off-plan cards are judged on merit.
                else if (risk > CONFIG.gunPathFloor) {
                    const t = (risk - CONFIG.gunPathFloor) / Math.max(1e-6, 1 - CONFIG.gunPathFloor);
                    add(-Math.round(6 + 60 * t), 'gun-path');
                }
            }
        }

        // KNOCKBACK+ZONE COMBO (user directive): SUPER VODKA CRANBERRY's
        // whip keeps bosses pinned inside SOUTH SIDE's burning ground — once
        // one half of the combo exists, the other half's cards jump in value.
        {
            const haveKb = [...supersMade].some(n => /VODKA\s*CRANBERRY/i.test(n));
            const haveZone = [...supersMade].some(n => /SOUTH\s*SIDE/i.test(n));
            if (!atCap && (type === 'weapon' || type === 'super' || type === 'passive')) {
                if (haveKb && /SOUTH\s*SIDE|MINT/i.test(name)) add(8, 'kb-zone-combo');
                if (haveZone && /VODKA\s*CRANBERRY|CRANBERRY/i.test(name)) add(8, 'kb-zone-combo');
            }
        }

        // RAINBOW RUSH: the goal is six super cocktails AS SOON AS POSSIBLE
        // once hell begins — every super card, super-level, and last-step key
        // ingredient gets priority toward the gun.
        if (type === 'super' && hellDetected) add(40, 'rainbow-rush');
        // SOURCE-INSPECTED (user bug report checked): the gun's real gate is
        // maxedSupers >= 6 — six supers EACH LEVELED TO 6, not six unlocks.
        // (No 7-cocktail requirement exists in the current build.) Leveling
        // existing supers IS the rainbow path — priority raised accordingly.
        if (/^★?\s*SUPER\b/i.test(name) && !atCap) {
            // whose super is this? strip the SUPER/UP decoration and match
            const bare = name.replace(/^★?\s*SUPER\s*/i, '').replace(/\s*UP$/i, '').trim();
            const bannedLine = AVOID_COCKTAILS.has(bare) && !PLAN_COCKTAILS.includes(bare);
            add(hellDetected ? 58 : 42, 'super-level');
            if (bannedLine) {
                // a banned line's super still beats junk, but never a plan super
                const planSuperInPool = Array.isArray(poolArr) && poolArr.some(c => {
                    const cn = baseNameOf(c);
                    if (cn === name) return false;
                    if (!/^★?\s*SUPER\b/i.test(cn)) return false;
                    const cb = cn.replace(/^★?\s*SUPER\s*/i, '').replace(/\s*UP$/i, '').trim();
                    return PLAN_COCKTAILS.includes(cb);
                });
                add(planSuperInPool ? -220 : -60, 'banned-super-line');
            }
        }   // in hell, LEVELING supers is the last gate before the gun
        // …and once the gun exists, EVOLVING it (rbstat) outranks everything —
        // the rainbow's growth curve is what carries the run to rank #1.
        if (type === 'rbstat' && rainbowThisRun) add(80, 'rainbow-evolve');

        if (card && card.isNew) add(6, 'new');
        // v6.89.3 — A STACKING BONUS HAS NO CAP, so the cap penalty must not
        // reach it. A live pick audit from a deep run shows TIME STOP +2S
        // carrying `maxed-40` from gt 3783 onward:
        //     gt 3783  took TIME STOP +2S  247  timestop+215 ... maxed-40 ...
        // It kept winning only because the deep-hell pool had collapsed to three
        // cards; in any richer pool it was handing back 40 points it never owed.
        // These three are CONSUMABLE STACKS, not levelled items — the crown run
        // finished with timestopBonus 162, against a live sample of 8 at level
        // 64, so the stat climbs far past anything a 6-level cap could mean.
        // Whatever lv/maxlv the card reports, `atCap` is the wrong question for
        // them.
        const STACKING = (type === 'sp_timestop' || type === 'sp_firecross' || type === 'sp_tequila');
        if (atCap && !STACKING) add(-40, 'maxed');
        // audit fix: measured means used to count TWICE (priority tables AND
        // ucb both scale with the same mean) — that double vote is what kept
        // dragging picks toward off-plan measured favorites. Once an item has
        // real data (n>=3), the ucb term is halved to a tiebreaker.
        add(ucbScore(name) * (((learn.items[name] || {}).n || 0) >= 3 ? 0.5 : 1), 'ucb');
        {
            // v6.107.0: both learned layers read ONE context vector. Building
            // it twice would be two different game states in the same pick.
            const xCtx = pickContext();
            add(ctxLearnBonus(name, xCtx), 'ctx-learn');   // contextual bandit layer (LinUCB), per card name
            add(tagLearnBonus(name, xCtx), 'tag-learn');   // the same layer generalised over ATTACK TYPE
        }

        // PLAN-FIRST DISCIPLINE (user): off-plan, un-owned cards yield to
        // live in-plan options in the same pool — a good measured mean
        // (COINTREAU, ORANGE) no longer outranks the prescribed roster.
        // Exempt: rainbow-path substitutes (super key already in the plan)
        // and passives that are the READY key of an owned cocktail.
        if ((type === 'weapon' || type === 'passive') && !atCap &&
            !(ownedLevels[name] > 0) &&
            !(type === 'weapon' && (PLAN_COCKTAILS.includes(name) || PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name]))) &&
            !(type === 'passive' && (PLAN_INGREDIENTS.includes(name) ||
                COCKTAILS.some(c => (ownedLevels[c] || 0) > 0 && SUPER_KEY_INGREDIENT[c] === name)))) {
            const gtP = typeof G.gameTime === 'number' ? G.gameTime : 0;
            const dayStrict = gtP < 1200 && !hellDetected;   // funding phase: zero wasted picks
            const planAlt = Array.isArray(poolArr) && poolArr.some(c => {
                const t = String((c && c.type) || '').toLowerCase();
                const n = baseNameOf(c);
                if (n === name) return false;
                const clv = levelOf(c), ccap = maxLevelOf(c);
                if (clv > 0 && ccap && clv >= ccap) return false;
                if (dayStrict && ['super', 'evolve', 'rainbowup', 'ult', 'base', 'rbstat'].includes(t)) return true;
                if (t === 'weapon') return PLAN_COCKTAILS.includes(n) || (dayStrict && (ownedLevels[n] || 0) > 0);
                if (t === 'passive') return PLAN_INGREDIENTS.includes(n) || (dayStrict && (ownedLevels[n] || 0) > 0);
                return false;
            });
            if (planAlt) add(dayStrict ? -30 : -14, 'off-plan');   // junk picks bury deeper in the funding phase (user)
        }

        // USER AVOID LIST: "ignore ... unless no other ingredients in the
        // priority roadmap appear". An avoided cocktail/passive that is NOT
        // in the active plan is buried whenever this pool offers any
        // non-avoided roadmap option — and scores normally (last resort)
        // when the pool has nothing from the roadmap.
        // RAINBOW CARDS ARE EXEMPT from every roster rule below (user: the
        // roster must never block the gun or its evolutions) — they exit
        // before any cap or penalty can touch them.
        if (type === 'rainbowup' || type === 'rbstat') {
            return { index, name, type, lv, cap, score, why: why.join('') };
        }
        // USER EXCEPTION: MOJITO/MANHATTAN are banned as gun risks — but if
        // taking one CANNOT open a new super line (its key is nowhere near
        // maxed, or its super already exists), the ban has nothing to protect
        // and the card may compete normally as a body.
        let gunRiskExempt = false;
        if (type === 'weapon' && /^(MOJITO|MANHATTAN)$/.test(name)) {
            const nS = Math.max(supersMade.size, liveSuperCount());
            // v6.92.1: was a hardcoded 5 while the cap lived in CONFIG — the
            // exemption outlived the cap it was meant to track.
            gunRiskExempt = nS < CAP_LINES() && !opensNewSuperLine('weapon', name) &&
                (ownedLevels[SUPER_KEY_INGREDIENT[name]] || 0) < 4;
        }
        let avoidJunk = false;
        if ((type === 'weapon' && AVOID_COCKTAILS.has(name) && !PLAN_COCKTAILS.includes(name) && !gunRiskExempt &&
                !((ownedLevels[name] || 0) > 0 && ownedCocktailCount() <= 1)) ||
            (type === 'passive' && AVOID_INGREDIENTS.has(name) && !PLAN_INGREDIENTS.includes(name))) {   // owned or not: junk never earns more levels while the plan wants them
            avoidJunk = true;
            // (owned WEAPONS are exempt: once committed — e.g. picked as a
            // sanctioned last resort — leveling the investment stays right)
            const poolHasRoadmapAlt = Array.isArray(poolArr) && poolArr.some(c => {
                const t = String((c && c.type) || '').toLowerCase();
                const n = baseNameOf(c);
                if (n === name) return false;
                if (['super', 'evolve', 'rainbowup', 'ult', 'rbstat'].includes(t)) return true;   // premium cards always beat avoided fillers
                const clv = levelOf(c), ccap = maxLevelOf(c);
                if (clv > 0 && ccap && clv >= ccap) return false;   // a MAXED card is a dead pick, not an alternative
                if (t === 'base') return true;
                if (t === 'weapon') return !AVOID_COCKTAILS.has(n) && (PLAN_COCKTAILS.includes(n) || (ownedLevels[n] || 0) > 0);
                if (t === 'passive') return !AVOID_INGREDIENTS.has(n) && (PLAN_INGREDIENTS.includes(n) || (ownedLevels[n] || 0) > 0);
                return false;
            });
            if (poolHasRoadmapAlt) add(-70, 'user-avoid');
        }
        // exception: with NO cocktail owned yet, an avoided weapon may still
        // be the only path to having a weapon at all — don't cap it then
        if (avoidJunk && type === 'weapon' && ownedCocktailCount() === 0) avoidJunk = false;

        // JUNK-CAP (user: TONIC still getting picked): an avoided item's
        // final score is clamped BELOW the re-roll threshold — measured
        // means and ucb can no longer float junk above a GINGER BEER re-roll.
        if (avoidJunk && score > (type === 'passive' ? 19 : 18)) {
            score = type === 'passive' ? 19 : 18;
            why.push('junk-cap ');
        }
        // SLOT BURN (live-diagnosed: junk passives filled every slot and
        // locked CAMPARI/TOMATO JUICE out of a 5-super run): a NEW banned
        // item costs a PERMANENT slot — capped below gold and consumables,
        // it is taken only when the pool holds literally nothing else.
        if (avoidJunk && lv === 0 && score > 8) { score = 8; why.push('slot-burn '); }
        // JUNK ORDERING (user): when a pool offers nothing but banned items,
        // they are not all equally worthless. COFFEE BEANS grants a REVIVE —
        // an extra life is worth more than any filler stat late in a run —
        // so it outranks COINTREAU and the rest of the junk from mid-game on.
        // (Applied after the caps so it orders within the junk tier only.)
        if (avoidJunk && type === 'passive' && !atCap) {
            const lateish = hellDetected || (typeof G.gameTime === 'number' && G.gameTime > 600);
            if (name === 'COFFEE BEANS' && lateish) {
                // (6.79) revive + longer freeze/slow/poison (source: edur -> durMul)
                const stallBuild = !CROWN && CONFIG.rainbowPolicyOverride === 'skip';
                add((hellDetected ? 10 : 6) + (stallBuild ? 8 : 0), stallBuild ? 'junk-order:revive+freeze' : 'junk-order:revive');
            }
            else if (name === 'COINTREAU') add(-2, 'junk-order:filler');
        }
        // v6.86.8 (user): "corpse reviver no. 2 and absinthe can't attack
        // marks, so they should be in the absolute junk pile". The CR line —
        // the cocktail and the ABSINTHE that keys it — cannot touch the
        // stationary targets the day is spent on, which the bot already knew
        // for its zombies ("can hit NEITHER passouts NOR no-booking walls").
        // Both are already avoid-listed, so they were capped like any junk;
        // this puts them at the BOTTOM of the junk tier, under COINTREAU and
        // well under COFFEE BEANS' revive, so a pool of nothing but junk
        // still picks something that can hit a holdout.
        if (avoidJunk && DEAD_VS_HOLDOUTS.has(name)) add(-12, 'junk-order:dead-vs-holdouts');
        // ...and once 8+ distinct passives are owned, ANY new off-plan
        // passive is slot-guarded — the remaining slots belong to the plan.
        if (type === 'passive' && lv === 0 && !PLAN_INGREDIENTS.includes(name) &&
            Object.keys(ownedLevels).filter(k => INGREDIENT_TAGS[k]).length >= 8 && score > 10) {
            score = 10; why.push('slot-guard ');
        }
        return { index, name, type, lv, cap, score, why: why.join('') };
    }

    function readPool() {
        try {
            const p = window._pool;
            if (Array.isArray(p) && p.length) return p;
        } catch (e) { }
        return null;
    }
    function poolSignature(pool) {
        try { return pool.map(c => nameOf(c) + ':' + (c && c.lv)).join('|'); }
        catch (e) { return String(Math.random()); }
    }
    function learnFromPool(pool) {
        for (const c of pool) {
            const n = baseNameOf(c);
            if (!n) continue;
            if (typeof c.lv === 'number') ownedLevels[n] = Math.max(ownedLevels[n] || 0, c.lv);
            if (typeof c.maxlv === 'number' && c.maxlv > 0) ownedMax[n] = c.maxlv;
        }
    }

    function handleLevelUp() {
        const pool = readPool();
        if (!pool) return false;
        const sig = poolSignature(pool);
        const now = Date.now();
        // v6.88.0 AUDIT C4. This was a 900 ms TIME window, not a latch. If the
        // pick click missed (clickCardByIndex/clickCardByName can both return
        // false and nobody checked), the whole side-effect block below re-ran
        // and repeated every mutation: ownedLevels bumped again, runPicks and
        // runPickCtx pushed again, craftsThisRun++ again. Five seconds of a
        // stuck pool recorded six picks of one card — and ownedLevels then
        // drifts ABOVE the true level, so atCap/isMaxed lie to the whole scorer
        // for the rest of the run.
        //
        // v6.88.1 L2: ...and the cure was worse than the disease. `lastPoolSig`
        // is cleared only at startRun, so the FIRST repeat of a pool signature
        // latched handleLevelUp to `false` for the rest of the run. Above LV 60
        // the pool is mostly stat cards with no level in the signature, so the
        // same trio recurs within a few levels — after which the level-up screen
        // stayed up forever, the game clock froze, and the generic stuck-breaker
        // spent the run clicking the settings gear, the recipe book and pause.
        // Observed live at LV 71 / TIME 69:46 with the screen open and
        // "picked TIME STOP +2S" still on the panel.
        //
        // The two cases the old 900 ms window could not tell apart are told
        // apart by pool IDENTITY, not content: the game allocates a new array
        // per level-up, so a new object is always a new decision, while the
        // same object within the window is our own missed click. The real C4
        // defect — side effects recorded for a pick that never landed — is
        // fixed below instead, by committing them only after the pick lands.
        if (pool === lastPoolRef && sig === lastPoolSig && now - lastPickAt < 900) return false;
        learnFromPool(pool);
        if (hellDetected) applyHellUnban();

        const scored = pool.map(scoreCard).sort((a, b) => b.score - a.score);
        let best = scored[0];
        if (!best) return false;

        // =============================================================
        // v6.124.0 CLAIM BEFORE YOU LEVEL
        // =============================================================
        // User, on the 6.123.0 n=83 run that walked into the gun: "May need
        // to fill out cocktail slots earlier as choices go down dramatically
        // in hell." The pick log agrees with him exactly. The opening of the
        // fresh run was four STIRRING UP at 552-562 in the first 75 s —
        //   gt 68  STIRRING UP 562   over  GIN TONIC 291 (unclaimed)
        //   gt 75  STIRRING UP 562   over  WHISKY SOUR 207 (unclaimed)
        // — and by gt 1992-2116 the same bot's pools were SODA WATER /
        // COINTREAU / LEMON / GINGER BEER / SIDECAR: a slot still open at
        // gt 2281 (MOSCOW MULE was claimed there, in HELL). The slot-claim
        // term (+60, 6.89.0) is under the survival core by design and can
        // never reach the base card: measured on the built 6.123.0 script,
        // base-attack+310 day-base-second+220 = 541 against SOUTH SIDE 334,
        // GIN TONIC 238, VODKA TONIC 237, MOJITO 216, MOSCOW MULE 209,
        // WHISKY SOUR 177. Raising slot-claim to close a 300-point gap is
        // the 6.89.0 disaster (+250 outranked OLIVE and two runs died in the
        // day holding seven level-1 weapons).
        //
        // So this is not a score. It is a RULE about one pair of cards:
        // when the ONLY thing beating an unclaimed plan cocktail is a
        // level-up of the base attack, take the cocktail. The base card is
        // offered again and again — a level deferred by one pool is a level
        // taken at the next — while a slot unclaimed by hell is a slot the
        // narrowed pool fills with junk or a gun line. Everything else keeps
        // its rank: the ult still outranks both, OLIVE still outranks the
        // cocktail, and a cocktail that is not second on merit is not
        // promoted. This is the user's own phase-1 list — "Mojito, gin
        // tonic, vodka tonic, southside, ultimate, shaking up as the first
        // picks" — read as CLAIM the cocktails, then level the base.
        // Day only: in hell the base is normally capped anyway, and a super
        // needs it maxed.
        {
            const claimOn = !(CONFIG.abilities && CONFIG.abilities.claimBeforeLevel === false);
            const second = scored[1];
            if (claimOn && !hellDetected && second && best.type === 'base' &&
                !(best.lv > 0 && best.cap && best.lv >= best.cap) &&
                second.type === 'weapon' && !(second.lv > 0) &&
                // PLAN membership is the whole test — MOJITO sits on the
                // avoid list AND the plan, and the plan wins everywhere
                // else in this file (avoidJunk, slot-claim). No AVOID guard.
                PLAN_COCKTAILS.includes(second.name) &&
                !((ownedLevels[second.name] || 0) > 0)) {
                second.why = (second.why || '') + ' claim-before-level(over ' + best.name + '=' + Math.round(best.score) + ')';
                scored.splice(1, 1); scored.unshift(second);
                best = second;
            }
        }

        // v6.87.3 (user): "at a certain point in the early hell mode, there are
        // only 2 choices forcing the bot to pick a super cocktail leading item".
        // A FORCED pool is one where EVERY card walks an off-plan super line —
        // no safe sink on offer, so whatever we take advances the gate. Two
        // things follow.
        //
        // First, this is worth a re-roll even when the pool does not look
        // "weak": the old threshold (best < 22) misses a pool of two decent
        // cards that both happen to be gun paths.
        //
        // Second, it is worth RECORDING. The mechanic behind a two-card pool is
        // not something I can read from here — most likely the plan's own lines
        // have hit their caps and can no longer absorb a level, so the game has
        // nothing left to offer but new ones. `pineBot.gunForced()` keeps what
        // was actually on the table so the cause can be read off real runs
        // instead of guessed at.
        const gunRisk = c => gunPathProgress(String((c && c.type) || '').toLowerCase(), baseNameOf(c));
        const forcedGunPool = pool.length > 0 && pool.every(c => {
            const t = String((c && c.type) || '').toLowerCase();
            if (t === 'rainbowup') return true;
            return (t === 'weapon' || t === 'passive') && gunRisk(c) > 0;
        });
        if (forcedGunPool) {
            gunForcedLog.push({
                gt: Math.round((typeof G.gameTime === 'number' ? G.gameTime : 0)),
                hell: hellDetected === true,
                offered: pool.map(c => baseNameOf(c) + '(' + String((c && c.type) || '') + ' lv' + (levelOf(c) || 0) +
                    ' risk' + gunRisk(c).toFixed(2) + ')'),
                supers: supersMade.size,   // liveSuperCount is scoped inside scoreCard
                took: null
            });
            while (gunForcedLog.length > 40) gunForcedLog.shift();
            log('FORCED gun pool (' + pool.length + ' cards, all gun paths): ' +
                gunForcedLog[gunForcedLog.length - 1].offered.join(' | '));
        }

        // GINGER BEER grants level-up RE-ROLLS (recipe book): if the whole
        // pool is weak, spend one instead of eating a dead pick. Once per pool.
        // v6.87.3: a forced gun pool re-rolls on its own account, whatever it
        // scores — spending a re-roll is strictly better than opening a line.
        if ((best.score < 22 || forcedGunPool) && sig !== lastRerollSig) {
            const rr = findByText(/re-?roll/i);
            if (rr) {
                lastRerollSig = sig;
                clickEl(rr);
                setStatus(forcedGunPool ? 'forced gun pool — re-rolled' : 'weak pool — re-rolled');
                return true;
            }
        }

        // v6.88.1 L2: TAKE THE CARD FIRST. Everything below this line mutates
        // run state — ownedLevels, runPicks, the milestone counters, the LinUCB
        // training set — and none of it may be recorded for a pick the game
        // never received. This is the defect AUDIT C4 was aiming at; ordering
        // fixes it without a latch that can outlive the screen.
        const landed = hasGame('pickUpgrade')
            ? (callGame('pickUpgrade', best.index), true)
            : (clickCardByIndex(best.index) || clickCardByName(best.name));
        if (!landed) return false;   // retry next tick; nothing recorded

        lastPoolSig = sig;
        lastPoolRef = pool;
        lastPickAt = now;
        levelupStuckAt = 0;

        // Commit to a build the first time we take a cocktail.
        if (!primaryCocktail && COCKTAILS.includes(best.name)) primaryCocktail = best.name;
        ownedLevels[best.name] = Math.max(ownedLevels[best.name] || 0, (best.lv || 0) + 1);
        // v6.89.0: remember a max BEFORE a craft can absorb it. This is the
        // only moment the information exists — after fusion the half is gone
        // from ownedLevels and every super-key guard would read it as level 0.
        if (ownedLevels[best.name] >= (ownedMax[best.name] || best.cap || 6)) everMaxed.add(best.name);
        runPicks.push(best.name);
        runPickCounts[best.name] = (runPickCounts[best.name] || 0) + 1;
        runPickCtx.push({ name: best.name, x: pickContext() });   // LinUCB training example

        // Milestones (reward shaping): supers, crafts, and the Rainbow Gun.
        // SUPER UNLOCKS ONLY (v6.81.0): super-LEVEL cards share the type /
        // name shape, so the old ++ counted every level — long runs logged
        // 9-13 "supers" against a 5-super cap, over-crediting the milestone.
        // Key by the bare cocktail name; the count is the number of lines.
        if (best.type === 'super') {
            supersMade.add(best.name.replace(/^★?\s*SUPER\s*/i, '').replace(/\s*UP$/i, '').replace(/\s*(LV\.?\s*\d+|\+\d+)\s*$/i, '').trim() || best.name);
            supersThisRun = supersMade.size;
        }
        else if (best.type === 'evolve') craftsThisRun++;
        else if (best.type === 'rainbowup') { rainbowThisRun = true; rainbowAt = gameMs(); }

        // v6.87.3: close the loop — which of the bad options did we eat?
        if (forcedGunPool && gunForcedLog.length) gunForcedLog[gunForcedLog.length - 1].took = best.name;
        pickAudit.push({
            gt: Math.round((typeof G.gameTime === 'number' ? G.gameTime : 0)),
            took: best.name, score: Math.round(best.score), why: best.why.trim(),
            over: scored.slice(1, 3).map(o => o.name + '=' + Math.round(o.score))
        });
        if (pickAudit.length > 14) pickAudit.shift();
        log('level-up:', scored.map(s => `${s.name}(${s.type})=${s.score.toFixed(0)}`).join('   '));
        setStatus('picked ' + best.name);

        lastLevelUpAt = gameMs();
        return true;   // v6.88.1 L2: the pick already landed, above.
    }

    // =================================================================
    // DOM FALLBACKS (used only when the game API isn't reachable)
    // =================================================================
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    function inPanel(el) {
        try { return !!(el && el.closest && el.closest('#pineBotPanel, #pineBotReport')); }
        catch (e) { return false; }
    }
    function visible(el) {
        if (!el || inPanel(el)) return false;
        try {
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity || '1') < 0.05) return false;
            const r = el.getBoundingClientRect();
            return r.width > 2 && r.height > 2;
        } catch (e) { return false; }
    }
    function clickEl(el) {
        if (!el) return false;
        try {
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
            try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (e) { }
            el.dispatchEvent(new MouseEvent('mousedown', o));
            try { el.dispatchEvent(new PointerEvent('pointerup', o)); } catch (e) { }
            el.dispatchEvent(new MouseEvent('mouseup', o));
            el.dispatchEvent(new MouseEvent('click', o));
            if (typeof el.click === 'function') el.click();
            lastAction = 'click "' + String(el.textContent || '').trim().slice(0, 24) + '"';
            return true;
        } catch (e) { return false; }
    }
    function findByText(re) {
        const all = [...document.querySelectorAll('button, a, [role="button"], [onclick], .btn, div, span, li')];
        let best = null, bestLen = Infinity;
        for (const el of all) {
            if (!visible(el)) continue;
            const t = (el.textContent || '').trim();
            if (!t || t.length > 60 || !re.test(t)) continue;
            // Prefer the shortest text; on ties prefer the DEEPEST element
            // (a wrapper div and its button share the same text — the click
            // handler lives on the button, and events bubble up, not down).
            if (t.length < bestLen || (t.length === bestLen && best && best.contains(el))) {
                best = el; bestLen = t.length;
            }
        }
        return best;
    }
    function clickText(re) { return clickEl(findByText(re)); }
    // v6.88.0 AUDIT C3/S2: findByText with a veto, so a matching-but-forbidden
    // element (the hell leaderboard TOGGLE; an OK on the name form) is skipped
    // without masking a legitimate match elsewhere on the screen.
    function clickTextIf(re, ok) {
        const all = [...document.querySelectorAll('button, a, [role="button"], [onclick], .btn, div, span, li')];
        let best = null, bestLen = Infinity;
        for (const el of all) {
            let t = '';
            try { t = (el.textContent || '').trim(); } catch (e) { continue; }
            if (!t || t.length > 120 || !re.test(t) || !visible(el)) continue;
            if (typeof ok === 'function' && !ok(el)) continue;
            if (t.length < bestLen) { best = el; bestLen = t.length; }
        }
        return clickEl(best);
    }

    function cardElements() {
        const sels = ['#levelCards > *', '.levelup .card', '.upgrade-card', '#upCards > *', '.cards > *', '.choice'];
        for (const s of sels) {
            let els = [];
            try { els = [...document.querySelectorAll(s)].filter(visible); } catch (e) { }
            if (els.length >= 2) return els;
        }
        return [];
    }
    function clickCardByIndex(i) {
        const els = cardElements();
        return els[i] ? clickEl(els[i]) : false;
    }
    function clickCardByName(name) {
        const n = norm(name);
        if (!n) return false;
        for (const el of cardElements()) if (norm(el.textContent).includes(n)) return clickEl(el);
        return clickText(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
    const NON_RENDERED = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
    function renderedTextOf(el) {
        // fallback for environments without innerText: textContent, minus scripts
        if (!el || NON_RENDERED[el.tagName] || el.id === 'pineBotPanel' || el.id === 'pineBotReport') return '';
        let t = '';
        for (const n of el.childNodes) {
            if (n.nodeType === 3) t += n.nodeValue;
            else if (n.nodeType === 1) t += ' ' + renderedTextOf(n);
        }
        return t;
    }
    function bodyText() {
        // IMPORTANT: never `innerText || textContent`. A <script>'s innerText is
        // '' (falsy), so that fallback dumped the game's entire source code into
        // the text — which contains the word HELL — causing false hell latches.
        try {
            let t = '';
            for (const el of document.body.children) {
                if (el.id === 'pineBotPanel' || el.id === 'pineBotReport') continue;
                if (NON_RENDERED[el.tagName]) continue;
                const it = el.innerText;
                t += ' ' + (it !== undefined ? it : renderedTextOf(el));
            }
            return t;
        } catch (e) { return ''; }
    }


    // =================================================================
    // RUN LIFECYCLE + STATS
    // =================================================================
    function snapshotStats() {
        const t = G.gameTime, k = G.killCount, m = G.money;
        return {
            time: typeof t === 'number' ? t : (runStart ? (Date.now() - runStart) / 1000 : null),
            downs: typeof k === 'number' ? k : null,
            sales: typeof m === 'number' ? m : null
        };
    }

    function parseResultScreen() {
        const text = bodyText();
        const out = { time: null, downs: null, sales: null };
        let m = text.match(/TIME\s*SURVIVED[^\d]*(?:(\d+):)?(\d+):(\d{2})/i);
        if (m) out.time = (m[1] ? +m[1] : 0) * 3600 + (+m[2]) * 60 + (+m[3]);
        m = text.match(/CUSTOMERS\s*DOWNED[^\d]*([\d,]+)/i);
        if (m) out.downs = +m[1].replace(/,/g, '');
        m = text.match(/TODAY['’]?S\s*SALES[^\d]*([\d,]+)/i);
        if (m) out.sales = +m[1].replace(/,/g, '');
        return out;
    }

    // The unbounded half of the reward. Kept separate so it can be asserted
    // directly: strictly increasing in time, with NO ceiling at any horizon.
    function hellTimeBonus(timeS) {
        const ms = CONFIG.milestones;
        const t = Math.max(0, timeS || 0);
        const depth = ms.hellDepth * Math.log2(1 + Math.max(0, (t - 1200) / 1800));
        // v6.91.6: a FIXED reference, not the live crown. See milestones.crownRefS.
        const ref = ms.crownRefS || 15150;
        return depth + ms.crownProgress * (t / ref);
    }

    function computeReward(stats) {
        const n = CONFIG.normalize, w = CONFIG.scoring, ms = CONFIG.milestones;
        const t = Math.min(1.6, (stats.time || 0) / n.time);
        const d = Math.min(1.6, (stats.downs || 0) / n.downs);
        const s = Math.min(1.6, (stats.sales || 0) / n.sales);
        let r = w.time * t + w.downs * d + w.sales * s;
        // Milestone shaping: the optimizer climbs toward the ACTUAL goals —
        // supers unlocked, crafts made, day survived, hell entered, rainbow.
        r += ms.superUnlock * supersThisRun;
        r += ms.craft * craftsThisRun;
        if (dayClearedThisRun) r += ms.dayCleared;
        if (hellRunEnded) {
            r += ms.hellEntered;
            // ── THE SATURATION BUG (found v6.79.0, fixed here) ───────────────
            // Every term above is capped. t/d/s cap at 1.6 (t saturates at just
            // 24 min) and the old deep-hell term was
            //     ms.hellDepth * Math.min(3, (time - 1200) / 1800)
            // which pins at time = 1200 + 3*1800 = 6600s = 110 MINUTES.
            // Past 110 minutes the optimizer received EXACTLY ZERO gradient:
            // the 252:30 crown run scored 3.34 while a 115-minute run scored
            // 3.39, purely because it made one more craft. CEM was therefore
            // blind to every improvement in the half of the run that decides
            // the crown. Two replacements, both unbounded:
            //   1. log2 depth — diminishing but never flat.
            //   2. crown progress — LINEAR in survival time, measured against
            //      the live crown, so the single thing we are optimising for
            //      produces gradient at every second of the run.
            r += hellTimeBonus(stats.time || 0);
        }
        if (rainbowThisRun) r += ms.rainbow;
        // v6.108.0: a PROVEN cap is a milestone, not a truncation. capEarly
        // means the stability proof or the saturation detector fired — the
        // run demonstrated it could not be killed. A bare runCapS timeout is
        // excluded on purpose: reaching a clock proves nothing about a build.
        if (capEarly && ms.immortal) r += ms.immortal;
        return r;
    }

    function startRun() {
        runActive = true;
        resetPoTracking();   // v6.86.2: passout kill-rate evidence is per run
        runStart = Date.now();
        runPicks = [];
        runPickCounts = {};
        primaryCocktail = null;
        ownedLevels = {};
        ownedMax = {};
        everMaxed = new Set();
        lastPoolSig = null;
        lastPoolRef = null;
        levelupStuckAt = 0;
        hellDetected = pendingHellEntry;   // we took the hell entrance — this run IS hell
        hellEnteredAt = pendingHellEntry ? gameMs() : 0;
        pendingHellEntry = false;
        deathSnapshot = null;
        dangerAccum = { contact: 0, proj: 0, mark: 0, line: 0, rival: 0 };
        lastHpSample = null;
        lastMarkSnap = [];
        huntStartS = null; huntRestUntilS = 0;   // v6.91.0: the hunt budget is per-run
        harvStartS = null; harvRestUntilS = 0;   // v6.93.1: so is the harvest-approach clock
        trekStartS = null; trekRestUntilS = 0;   // v6.94.0: and the day-trek clock
        parkYieldId = null; parkYieldAt = 0; parkYieldSpentS = 0;     // v6.91.4 / v6.117.0
        parkFirstS = null; parkOnTicks = 0; parkedTicks = 0; entrySample = null;   // v6.91.8
        // v6.96.2 phase audit: a run that BEGINS in hell (the results-screen
        // hell entrance) entered at gt 0; otherwise the latch time is
        // recorded lazily by the first gather that sees hellDetected.
        hellEnterGt = hellDetected ? 0 : null;
        capFiredThisRun = false;
        capWpIdx = 0; capWpUntil = 0;   // v6.96.2: the cap patrol restarts its circuit
        capStableSince = null; capEarly = false;   // v6.99.3: the stability proof is per-run
        capFirstGt = null;                          // v6.99.4: capAt telemetry is per-run
        capDipSince = null; capBestStreakS = 0; capLastResetReason = null;   // v6.100.1: dip-grace state is per-run
        capHurtAt = 0; capForcedThisRun = false;   // v6.101.0: the cap ladder's actuator state is per-run
        capReadyGt = null;                         // v6.102.0: build-complete gt is per-run
        // v6.132.0: the build gate's monotone latch and its 1 s cache are per-run
        // too — a new run starts with no ingredients, and a latch carried over
        // would pass the build leg on a run that has not bought a single card.
        resetBuildGate();
        capFirstWall = 0; satSince = null; satPeakEn = 0;   // v6.108.0: wall stamp + saturation state are per-run
        spdLastGt = null; spdLastWall = 0; spdSamples = []; spdWorst = null;   // v6.108.0: speed telemetry is per-run
        invulnTicks = 0; planTicks = 0; ultMaxLv = 0; ultLv6At = null;   // v6.109.0: ult-uptime economy is per-run
        invulnAllTicks = 0; ultCasts = 0; ultLastReadyAt = null; ultCdMulSeen = null;   // v6.111.0
        laneInTicks = 0; laneEscTicks = 0; laneDivTicks = 0;   // v6.111.0: lane exposure and escapes are per-run
        // v6.112.0: the regime is a per-run achievement, not a session total
        deepRegimeTicks = 0; deepStreakFrom = null; deepHoldBest = 0; deepFirstGt = null;
        deepStillTicks = 0; deepInvTicks = 0; deepHpSum = 0;
        deepBreaks = {}; deepHolds = [];   // v6.115.0
        parkMiss = {};   // v6.116.0: the seat-miss census is per-run
        // ── v6.122.0 THREE PER-RUN LATCHES THAT startRun NEVER CLEARED ─────
        // `seenTypesThisRun` is read by endRun as "fold THIS RUN's first
        // sightings into the shared intel", but it was never reset, so after
        // run 1 it held the SESSION's first sightings and every later run
        // re-credited the same stale times into learn.spawnIntel — whose EMA
        // then converged on them while `n` kept climbing. A table reporting
        // "measured, n=40" held one observation replayed forty times, and it
        // drives bossSchedule() -> upcomingBossUnlock() -> the spawn-prep
        // bonuses. A 60-second first run anchored the whole session.
        seenTypesThisRun = {};
        // v6.122.0: and the craft audit's own `runs` counter was initialised
        // to 0 and never incremented by anything, so `runs: 0` in every report
        // was meaningless rather than informative. Every other audit bumps it
        // at a run boundary; this one now does too.
        try { craftAudit.runs = (craftAudit.runs || 0) + 1; craftAuditSave(); } catch (e) { }
        // `craftPending` latched a clicked-but-unconfirmed prompt across the
        // run boundary, so the NEXT run booked a phantom `confirmed` craft on
        // its first tick — inflating craftsThisRun, milestones.craft in the
        // reward that feeds cem.batch and the hall of fame, and the very
        // audit counter that exists to detect a click that does not land.
        craftPending = null;
        craftStateBooked = false;   // v6.122.0: one craft per entry into STATE 'craft'
        // `lastRerollSig` is "one re-roll per weak pool, max" — per POOL, but
        // it leaked across runs, so a signature that spent its re-roll in run
        // N was silently refused one in run N+1. Pool signatures repeat
        // readily above LV 60, where the file notes the same trio recurs
        // within a few levels.
        lastRerollSig = null;
        bossSeen = {};   // v6.112.0: the census is per-run; ids repeat across runs
        runHellTicks = 0; runPauseTicks = 0;     // v6.91.4: pause uptime is per-run
        enemyMix = { swarm: 0, ranged: 0, bomber: 0, boss: 0, total: 0 };
        computeRoadmap();   // the plan itself learns: re-derive from live build stats
        AVOID_INGREDIENTS = new Set(AVOID_INGREDIENTS_BASE);   // day rules until hell is latched
        hellUnbanApplied = false;
        if (hellDetected) applyHellUnban();
        killRate = 0; lastKillCount = null; lastKillAt = 0;
        dropAnchorTicks = 0; dropAnchorLastGt = 0;   // v6.107.0: anchor telemetry is per-run
        pressureAvg = 0; toughnessAvg = 1; dpsDeficit = 0; passoutAvg = 0;
        supersThisRun = 0; craftsThisRun = 0; rainbowThisRun = false; dayClearedThisRun = false;
        rainbowAt = 0;
        rainbowChoice = null;
        lastLevelUpAt = gameMs();
        supersMade = new Set();
        runPickCtx = [];
        beginTrial();
        log('run started; roster', activeRoster, '| CEM gen', learn.cem.gen, 'batch', learn.cem.batch.length + '/' + CONFIG.learning.batchSize, 'tab', TAB_ID);
    }

    // v6.96.2 PHASE CLASSIFICATION (user: "get the data of how it survived
    // day mode and hell and deep hell mode"). A run's phase is where it
    // ENDED, judged on hellRunEnded (captured before the results screen can
    // mutate the live flag) and the game-time the latch was seen:
    //   day   — hell never latched; the run died in the funding phase.
    //   entry — hell latched and death came within phaseAudit.entryS seconds
    //           of the latch: the entry surge, the window the seat bridges.
    //   hell  — past the entry window but before phaseAudit.deepFromS.
    //   deep  — past deepFromS: the parked-equilibrium regime. A cap-out
    //           books here with cap:true, so the row is legible as
    //           right-censored rather than as a natural death.
    function buildPhaseRow(t, hellEnded) {
        const PA = CONFIG.phaseAudit || {};
        const entryS = PA.entryS != null ? PA.entryS : 300;
        const deepFromS = PA.deepFromS != null ? PA.deepFromS : 7200;
        const ph = !hellEnded ? 'day'
            : (hellEnterGt != null && (t - hellEnterGt) < entryS) ? 'entry'
            : t < deepFromS ? 'hell' : 'deep';
        return {
            v: scriptTag(), t, ph,
            cause: lastDeathCause,
            hEnt: hellEnterGt == null ? null : Math.round(hellEnterGt),
            sup: supersThisRun,
            day: !!dayClearedThisRun,
            seat: entrySample ? !!entrySample.seated : null,
            def: entrySample ? entrySample.def : null,
            regen: entrySample ? entrySample.regen : null,
            ultLv: entrySample ? (entrySample.ultLv || 0) : null,
            cap: !!capFiredThisRun,
            // v6.99.4: gt at first patrol engage. capAt < runCapS = the
            // EARLY stability proof fired; capAt >= runCapS = the clock.
            capAt: capFirstGt == null ? null : Math.round(capFirstGt),
            // v6.102.0: gt the build met armour+supers. Answers "when is a
            // build actually complete?" across runs, cap-out or not.
            readyAt: capReadyGt == null ? null : Math.round(capReadyGt),
            // v6.108.0 THE STALL SIGNATURE, on every row. A probe of the run
            // that would not end measured 0.021 game-seconds per wall-second
            // with enemies pinned at 260 and HP flat. None of that was
            // visible in any audit — this makes it visible without a probe.
            //   spd  = median game-sec per wall-sec (1.0 = healthy page)
            //   spdLo= worst sample of the run
            //   enMax= peak live enemy count (the entity cap is ~260)
            //   why  = what armed the cap: 'saturated' names the new arm
            spd: (() => { if (!spdSamples.length) return null;
                const a = spdSamples.slice().sort((x, y) => x - y);
                return a[Math.floor(a.length / 2)]; })(),
            spdLo: spdWorst,
            enMax: satPeakEn || null,
            why: capFiredThisRun ? (capLastResetReason || null) : null,
            // v6.109.0 THE ULT-UPTIME ECONOMY, with v6.111.0's correction.
            //
            // 6.109.0 shipped `inv` so it could be compared against the manual
            // joe demo's 0.326. It should not have been: the demo's number ORs
            // in `player.invuln` (the 38-frame post-hit window) and `inv` does
            // not, so the "3.9x ult-uptime gap" read off that comparison at
            // n=1250 was a units error. Joe's ult ceiling is 8/80 = 10% at lv1
            // and 12/80 = 15% at lv6; a measured median of 0.103 is a bot
            // already firing near cooldown, not one hoarding its ult.
            //
            //   inv    = ULT invulnerability only        <- compare to nothing
            //   invAll = ult windows OR hit frames       <- compare to demo `invulnShare`
            //   casts  = ACCEPTED casts (ultReadyAt moved), not button presses
            //   cdMul  = observed player.ultCdMul — the real lever on uptime
            //   ultMax = highest ult level reached (lv6 wipes fields; lv1-3 chip)
            //   ult6At = gt the ult was maxed, null if never
            //   laneIn/laneEsc = ticks inside a live lane band, and ticks the
            //     v6.111.0 perpendicular override actually steered
            inv: planTicks ? +(invulnTicks / planTicks).toFixed(3) : null,
            invAll: planTicks ? +(invulnAllTicks / planTicks).toFixed(3) : null,
            casts: ultCasts || 0,
            cdMul: ultCdMulSeen == null ? null : +ultCdMulSeen.toFixed(3),
            ultMax: ultMaxLv || null,
            ult6At: ultLv6At == null ? null : Math.round(ultLv6At),
            laneIn: laneInTicks || 0,
            laneEsc: laneEscTicks || 0,
            // v6.114.0: ticks the override actually OVERRULED the danger
            // field. laneEsc alone was a copy of laneIn; this is the number
            // that says whether the override is doing anything.
            laneDiv: laneDivTicks || 0,
            // v6.112.0 THE DEEP-HELL REGIME — the user's definition, measured.
            // These replace `ph === 'deep'` as the success signal; the phase
            // label stays for continuity with every historical row.
            //   deepAt   = gt the regime was first entered (null = never)
            //   deepHold = longest CONTINUOUS hold, in game seconds
            //   deepStill= share of regime ticks with velocity exactly zero
            //              ("without any movement required", checked)
            //   deepInv  = ult invuln share DURING the regime ("fires
            //              ultimates to keep itself alive")
            //   deepHp   = mean HP ratio during the regime
            deepAt: deepFirstGt == null ? null : Math.round(deepFirstGt),
            deepHold: Math.round(deepHoldBest),
            deepStill: deepRegimeTicks ? +(deepStillTicks / deepRegimeTicks).toFixed(3) : null,
            deepInv: deepRegimeTicks ? +(deepInvTicks / deepRegimeTicks).toFixed(3) : null,
            deepHp: deepRegimeTicks ? +(deepHpSum / deepRegimeTicks).toFixed(3) : null,
            // v6.115.0: every hold this run, and what ended each one. A single
            // best-hold number cannot say whether the anchor fails once or
            // flickers twenty times, and those need opposite fixes.
            deepHolds: deepHolds.length ? deepHolds.slice(0, 20) : null,
            deepBreak: Object.keys(deepBreaks).length ? deepBreaks : null,
            // v6.116.0: hell ticks the bot was NOT seated, by cause, in the
            // planner's precedence order. Paired with hellT they say what
            // fraction of hell the anchor actually held and what is holding
            // the rest of it open. See the parkMiss declaration in 01.
            hellT: runHellTicks || 0,
            parkT: parkedTicks || 0,
            parkMiss: Object.keys(parkMiss).length ? parkMiss : null
        };
    }

    // v6.97.2 MULTI-TAB AUDIT APPEND (user runs 2+ game tabs). The learn
    // store merges across tabs (finishRun re-loads before crediting), but
    // the ROW-LIST audits never did: each tab kept its own in-memory array
    // and wrote the WHOLE object, so parallel tabs clobbered each other's
    // rows — measured: 266 runs since the store reset, 58 phase rows kept
    // (~22%, consistent with 4-5 tabs). Every append now re-reads the
    // stored list first, so this tab's new row lands on top of whatever
    // every other tab has written since our boot. The race window is one
    // synchronous read-modify-write — two tabs finishing in the same
    // millisecond can still lose one row, which is noise; losing 78% was
    // not. Returns the merged object so the caller adopts the shared view.
    function appendAuditRow(key, obj, field, row, keep) {
        try {
            const cur = JSON.parse(localStorage.getItem(key) || 'null');
            if (cur && Array.isArray(cur[field])) obj[field] = cur[field];
        } catch (e) { }
        obj[field] = obj[field] || [];
        obj[field].push(row);
        while (obj[field].length > keep) obj[field].shift();
        localStorage.setItem(key, JSON.stringify(obj));
        return obj;
    }

    function finishRun() {
        if (!runActive) return;
        runActive = false;
        // Capture hell status NOW, before any hell-entrance click on the
        // results screen can mutate the live flag and fake a hell record.
        hellRunEnded = hellDetected;

        // MULTI-TAB: merge in every other tab's progress before crediting this
        // run, then save — so parallel tabs accumulate into one shared pool
        // instead of overwriting each other.
        learn = loadLearn();

        const parsed = parseResultScreen();
        const snap = deathSnapshot || snapshotStats();
        const stats = {
            time: parsed.time ?? snap.time ?? 0,
            downs: parsed.downs ?? snap.downs ?? 0,
            sales: parsed.sales ?? snap.sales ?? 0
        };
        lastRunStats = stats;

        const reward = computeReward(stats);
        const base = baseline();
        creditItems(reward);
        creditLinUcb(reward);
        creditTagUcb(reward);   // v6.107.0: the same run also teaches the attack-type layer
        if (primaryCocktail) {
            const b = learn.builds[primaryCocktail] || { n: 0, sum: 0 };
            b.n = b.n * CONFIG.learning.decay + 1;
            b.sum = b.sum * CONFIG.learning.decay + reward;
            learn.builds[primaryCocktail] = b;
        }
        // MEASURED SPAWN TIMETABLE: fold this run's first-appearance times
        // into the shared intel (only runs long enough to be informative).
        for (const [k, gt] of Object.entries(seenTypesThisRun)) {
            if (gt > 5) {   // ignore instant spawns (basic mobs at t=0)
                const si = learn.spawnIntel[k] || { n: 0, sum: 0 };
                si.n = si.n * CONFIG.learning.decay + 1;
                si.sum = si.sum * CONFIG.learning.decay + gt;
                learn.spawnIntel[k] = si;
            }
        }
        // RAINBOW POLICY: if this run faced the take-vs-skip decision,
        // credit the arm it played so the crown-path bandit learns.
        if (rainbowChoice) {
            const rp = learn.rainbowPolicy[rainbowChoice] || { n: 0, sum: 0 };
            rp.n = rp.n * CONFIG.learning.decay + 1;
            rp.sum = rp.sum * CONFIG.learning.decay + reward;
            learn.rainbowPolicy[rainbowChoice] = rp;
        }
        // ROSTER EXPERIMENT: credit this run's reward to the roster it played,
        // so chooseRoster's explore/exploit has real evidence to compare.
        if (activeRoster) {
            const rs = learn.rosters[activeRoster] || { n: 0, sum: 0 };
            rs.n = rs.n * CONFIG.learning.decay + 1;
            rs.sum = rs.sum * CONFIG.learning.decay + reward;
            learn.rosters[activeRoster] = rs;
        }
        // dominant recent hazard = probable cause of death
        lastDeathCause = null;
        let dmax = 0.5;
        for (const k of Object.keys(dangerAccum)) {
            if (dangerAccum[k] > dmax) { dmax = dangerAccum[k]; lastDeathCause = k; }
        }
        // v6.85.22: learned per-type threat multiplier. Each type's share of
        // this run's attributed HP loss pulls its multiplier toward
        // 1 + 3*share (EMA, clamped 0.6-2.2); types that did nothing drift
        // back toward 1. gatherThreats multiplies the static profile weight
        // by this, so the danger field fears what has actually been hurting
        // THIS bartender, learned across runs.
        try {
            const totalHit = Object.values(hitTypeRun).reduce((a, b) => a + b, 0);
            if (totalHit > 0) {
                const mul = learn.enemyTypeMul || (learn.enemyTypeMul = {});
                const cnt = learn.enemyTypeN || (learn.enemyTypeN = {});
                for (const k of Object.keys(hitTypeRun)) {
                    const share = hitTypeRun[k] / totalHit;
                    // v6.107.0: TARGET NARROWED 1+3*share -> 1+1.2*share.
                    // The old target let a type that took most of one run's
                    // contact damage aim at 4.0 and sit against the 2.2 clamp
                    // permanently; a clamp that is the resting state is not a
                    // clamp. 1.2 puts a type that took ALL of a run's contact
                    // damage at 2.2 as its ASYMPTOTE, so the cap is reached
                    // only by a type that does it run after run.
                    const target = 1 + 1.2 * share;
                    mul[k] = Math.max(0.6, Math.min(2.2, 0.85 * (mul[k] || 1) + 0.15 * target));
                    cnt[k] = (cnt[k] || 0) + (hitTypeN[k] || 0);
                }
                for (const k of Object.keys(learn.enemyTypeMul)) {
                    if (!(k in hitTypeRun)) learn.enemyTypeMul[k] = 0.9 * learn.enemyTypeMul[k] + 0.1;
                }
            }
            hitTypeRun = {}; hitTypeN = {};
        } catch (e) { }
        // v6.85.13: persist the damage audit so a page reload does not lose it.
        // Written once per run, not per damage event — this is on the run-end
        // path, never in the frame loop. The event ring is trimmed hard because
        // the summary counters are what the analysis actually needs.
        try {
            dmgAudit.runs = (dmgAudit.runs || 0) + 1;
            dmgAudit.lastDeath = lastDeathCause;
            const slim = Object.assign({}, dmgAudit, { ev: dmgAudit.ev.slice(-120) });
            localStorage.setItem(DMG_AUDIT_KEY, JSON.stringify(slim));
        } catch (e) { }
        // v6.89.7: the income audit accumulates ACROSS runs — one run's deep
        // buckets hold only a few minutes of samples, and the balance at 90
        // minutes needs many runs before it means anything.
        try {
            incAudit.runs = (incAudit.runs || 0) + 1;
            localStorage.setItem(INC_AUDIT_KEY, JSON.stringify(incAudit));
        } catch (e) { }
        incCursor.t = null; incCursor.hp = null;   // next run starts a fresh integration
        // v6.91.1: close out any hunt still in flight when the run ended, then
        // count the run. Same cross-run accumulation as the income audit — a
        // single run rarely gets more than a couple of attempts.
        try {
            if (huntMark) { bookHunt(huntMark, 0); huntMark = null; }
            huntAudit.runs = (huntAudit.runs || 0) + 1;
            localStorage.setItem(HUNT_AUDIT_KEY, JSON.stringify(huntAudit));
        } catch (e) { }
        try {
            markAudit.runs = (markAudit.runs || 0) + 1;
            localStorage.setItem(MARK_AUDIT_KEY, JSON.stringify(markAudit));
        } catch (e) { }
        // v6.91.8: one record per HELL run — the build at the entrance, whether
        // the seat was ever reached, and how long the run lasted. Rolling window;
        // the question it answers is a comparison between two groups, not a total.
        try {
            if (hellRunEnded) {
                // v6.97.2: merge-on-write — see appendAuditRow.
                parkAudit = appendAuditRow(PARK_AUDIT_KEY, parkAudit, 'runs', {
                    t: Math.round(stats.time || 0),
                    first: parkFirstS,
                    onShare: runHellTicks ? +(parkOnTicks / runHellTicks).toFixed(3) : null,
                    seatShare: runHellTicks ? +(parkedTicks / runHellTicks).toFixed(3) : null,
                    entry: entrySample
                }, 80);
            }
        } catch (e) { }
        // v6.112.0 BOSS CENSUS — one row per run holding every boss first
        // sighted in it. This is the empirical half of "boss appearance and
        // size are predictable": across runs it yields the spawn timetable and
        // the radius growth curve, measured through the bot's own view of the
        // field rather than assumed from it.
        try {
            const seen = Object.keys(bossSeen || {});
            if (seen.length) {
                bossCensus = appendAuditRow(BOSS_CENSUS_KEY, bossCensus, 'runs', {
                    t: Math.round(stats.time || 0),
                    hell: !!hellDetected,
                    b: seen.map(k => bossSeen[k])
                }, 60);
            }
        } catch (e) { }
        // v6.96.2 PHASE AUDIT: one row per run, EVERY run — parkAudit above
        // only sees hell runs, and joe's whole problem lives in the 82% that
        // die before it. See buildPhaseRow for the classification.
        try {
            // v6.97.2: merge-on-write — see appendAuditRow.
            const phaseRow = buildPhaseRow(Math.round(stats.time || 0), hellRunEnded);
            phaseAudit = appendAuditRow(PHASE_AUDIT_KEY, phaseAudit, 'rows', phaseRow,
                (CONFIG.phaseAudit && CONFIG.phaseAudit.keep) || 240);
            bookImmortal(phaseRow);   // v6.126.0: the immortal COUNT survives row eviction
        } catch (e) { }
        try {
            if (runHellTicks > 0) {
                pauseAudit.runs = (pauseAudit.runs || 0) + 1;
                pauseAudit.hellTicks = (pauseAudit.hellTicks || 0) + runHellTicks;
                pauseAudit.pauseTicks = (pauseAudit.pauseTicks || 0) + runPauseTicks;
                localStorage.setItem(PAUSE_AUDIT_KEY, JSON.stringify(pauseAudit));
            }
        } catch (e) { }
        learn.history.push(reward);
        if (learn.history.length > 60) learn.history.shift();
        if (bartenderThisRun) {
            const atk = BARTENDER_TO_BASE_ATTACK[bartenderThisRun];
            const s = learn.items[atk] || { n: 0, sum: 0 };
            s.n += 1; s.sum += reward; learn.items[atk] = s; learn.totalPicks++;
        }
        // Run log for the 📊 stats report (shared across tabs like the rest).
        learn.runLog.push({
            t: Math.round(stats.time), d: stats.downs, s: stats.sales, r: +reward.toFixed(3),
            death: lastDeathCause, build: primaryCocktail,
            supers: supersThisRun, crafts: craftsThisRun,
            hell: hellRunEnded, day: dayClearedThisRun, rainbow: rainbowThisRun, rbp: rainbowChoice || undefined,
            gen: learn.cem.gen, champ: championRun, roster: activeRoster,
            v: scriptTag()
        });
        if (learn.runLog.length > 30) learn.runLog.shift();

        // PER-VERSION ROLLUP. runLog only keeps 30 entries, so version-vs-
        // version comparison needs its own durable accumulator. This is what
        // makes "which version performs best" an answerable question instead
        // of a reconstruction from memory. (v6.80.0: + downs/sales sums and
        // the version's TOP-N runs, so a frozen snapshot carries its best
        // runs with it.)
        {
            const vs = learn.versions[scriptTag()] || {
                n: 0, sumT: 0, bestT: 0, sumR: 0, sumD: 0, sumS: 0, hell: 0, day: 0,
                sumSupers: 0, deaths: {}, top: [], epoch: REWARD_EPOCH, firstRun: learn.runs
            };
            vs.n++;
            vs.sumT += stats.time || 0;
            vs.sumT2 = (vs.sumT2 || 0) + (stats.time || 0) * (stats.time || 0);
            if ((stats.time || 0) >= 3600) vs.over60 = (vs.over60 || 0) + 1;
            if ((stats.time || 0) >= 7200) vs.over120 = (vs.over120 || 0) + 1;
            vs.times = vs.times || [];
            vs.times.push(Math.round(stats.time || 0));
            while (vs.times.length > CONFIG.learning.versionTimesKeep) vs.times.shift();
            vs.bestT = Math.max(vs.bestT, stats.time || 0);
            vs.sumR += reward;
            vs.sumD = (vs.sumD || 0) + (stats.downs || 0);
            vs.sumS = (vs.sumS || 0) + (stats.sales || 0);
            vs.sumSupers += supersThisRun;
            if (hellRunEnded) vs.hell++;
            if (dayClearedThisRun) vs.day++;
            if (lastDeathCause) vs.deaths[lastDeathCause] = (vs.deaths[lastDeathCause] || 0) + 1;
            vs.lastRun = learn.runs;
            vs.top = vs.top || [];
            vs.top.push({
                run: learn.runs, t: Math.round(stats.time), d: stats.downs, s: stats.sales, r: +reward.toFixed(3),
                build: primaryCocktail, supers: supersThisRun, death: lastDeathCause,
                hell: hellRunEnded, champ: championRun, gen: learn.cem.gen
            });
            vs.top.sort((a, b) => b.t - a.t);   // ranked by the crown metric: survival time
            vs.top = vs.top.slice(0, CONFIG.learning.versionTopRuns);
            learn.versions[scriptTag()] = vs;
        }

        endTrial(reward);
        saveLearn();

        const verdict = base == null ? 'first recorded run'
            : reward > base ? `better than recent average (${reward.toFixed(3)} vs ${base.toFixed(3)})`
                : `below recent average (${reward.toFixed(3)} vs ${base.toFixed(3)})`;
        console.log('%c[PineBot] RUN END', 'font-weight:bold;color:#ffd98a',
            `\n  time ${Math.round(stats.time)}s   downs ${stats.downs}   sales ${stats.sales}` +
            `\n  reward ${reward.toFixed(3)} — ${verdict}` +
            `\n  version: ${scriptTag()}   roster: ${activeRoster || '(none)'}   build: ${primaryCocktail || '(none)'}` +
            `\n  picks: ${runPicks.join(', ') || '(none)'}` +
            `\n  milestones: supers ${supersThisRun}, crafts ${craftsThisRun}` +
            `${dayClearedThisRun ? ', DAY CLEARED' : ''}${hellRunEnded ? ', HELL' : ''}${rainbowThisRun ? ', RAINBOW!' : ''}` +
            `\n  died to: ${lastDeathCause || 'unknown'}` +
            `\n  final frame: ${lastPlan ? lastPlan.diag : 'n/a'}`);
        setStatus(`run over — ${Math.round(stats.time)}s / ${stats.downs} / ${stats.sales}`);
    }


    // =================================================================
    // v6.87.5 SECRET CRAFTS — the fusion prompt (SOURCE-READ, live DOM)
    // -----------------------------------------------------------------
    // openRecipe() states it outright: "SECRET CRAFTS · COMBINATIONS
    // (level the ingredients -> a fusion prompt appears mid-run)". The
    // prompt is a DOM overlay with `#craftBtn` ("MAKE BLACK VERMOUTH")
    // and `.craft-no` ("NOT NOW"). It does NOT change G.state, so the
    // `craft()` screen handler — which only runs when state === 'craft'
    // — never fired. And even when it did, its clickText regex was
    // /make it|craft|confirm|yes/, which does not match "MAKE BLACK
    // VERMOUTH". Two independent misses, and the cost was every craft
    // in every run: a live probe found sweetver lv6 + dryver lv6, an
    // EMPTY `player.absorbed`, and the prompt still sitting on screen.
    //
    // applyCraft() shows why that is expensive. The consumed materials
    // stay in player.weapons at full level — "능력치 효과는 계속 적용되고,
    // 슬롯 카운트에서만 빠짐 (3칸 -> 조합품 1칸)" — so the parts keep their
    // stat effect and only stop occupying slots. A craft is pure upside:
    // a free weapon plus slot relief on a bar the probe found holding 15.
    //
    // Never click NOT NOW: declining is strictly worse than any pick.
    function takeCraftPrompt() {
        try {
            // v6.88.0 AUDIT C1. The previous version incremented craftsThisRun
            // BEFORE clicking, did not check whether the click landed, and had
            // no dedupe — while handleScreens calls this every overlayMs (260ms)
            // for as long as the prompt is up. A prompt the game ignores was
            // therefore worth ~4 crafts per second: ten seconds booked 38, and
            // `milestones.craft * 38 = 1.90` is larger than the entire
            // time+downs+sales contribution to the reward. That number went
            // into cem.batch, the elites and the hall of fame, so the optimiser
            // converged on whichever vector happened to be playing while a
            // prompt was stuck. Now: latch on the prompt's identity, and only
            // COUNT the craft once the prompt is gone (proof the click worked).
            // v6.118.0: is a craft OWED right now? Both halves of a CRAFT_PAIR
            // at max is the game's own stated trigger, so this separates "the
            // prompt never came" from "the prompt came and we missed it".
            try {
                for (const pair of CRAFT_PAIRS) {
                    if ((ownedLevels[pair[0]] || 0) >= 6 && (ownedLevels[pair[1]] || 0) >= 6) {
                        craftAuditNote('ready');
                        const pk = pair.join('+');
                        craftAudit.pairs[pk] = (craftAudit.pairs[pk] || 0) + 1;
                        break;
                    }
                }
            } catch (e) { }
            const yes = document.querySelector('#craftBtn, .craft-yes, .craft-ok');
            let target = (yes && visible(yes)) ? yes : null;
            let label = target ? (target.textContent || 'craft').trim() : '';
            // v6.118.0: every visible button label while a craft is owed — the
            // evidence that tells a changed label from an absent prompt.
            try {
                for (const b of [...document.querySelectorAll('button, [onclick], .btn')]) {
                    if (!visible(b)) continue;
                    const t = (b.textContent || '').trim();
                    if (/vermouth|craft|조합|만들기|make|combine|fuse/i.test(t)) craftAuditNote('seen', t);
                }
            } catch (e) { }
            if (!target) {
                for (const b of [...document.querySelectorAll('button, [onclick], .btn')]) {
                    const t = (b.textContent || '').trim();
                    if (!visible(b)) continue;
                    // v6.88.0 AUDIT S2-adjacent: the decline filter was English
                    // only while the accept side matched Korean anywhere in the
                    // label, so a Korean decline could be clicked. Both sides
                    // are now anchored and both languages are covered.
                    if (/^(not now|later|no thanks)\b/i.test(t)) continue;
                    if (/^(안\s*함|나중에|취소)/.test(t)) continue;
                    if (/^(make|combine|fuse)\b/i.test(t) || /^(조합|만들기)/.test(t)) { target = b; label = t; break; }
                }
            }
            if (!target) {
                // prompt gone: if we clicked one, THAT is when it counts
                if (craftPending) {
                    craftsThisRun++;
                    craftAuditNote('confirmed'); craftAuditSave();   // v6.118.0
                    log('craft confirmed: ' + craftPending + ' (total ' + craftsThisRun + ')');
                    craftPending = null;
                }
                return false;
            }
            const sig = (target.id || '') + '|' + label.slice(0, 40);
            if (sig === craftPending) return true;   // already clicked THIS prompt — wait it out
            craftPending = sig;
            craftAuditNote('clicked', label); craftAuditSave();   // v6.118.0
            clickEl(target);
            setStatus('craft: ' + label.slice(0, 24));
            return true;
        } catch (e) { }
        return false;
    }

    // =================================================================
    // SCREEN AUTOMATION — driven by the game's own `state`
    // =================================================================
    // v6.125.0 THE IMMORTAL STOP RULE — see CONFIG.graduation for the user's
    // words and the field-by-field definition. Three pure pieces and one hook.
    //
    // isImmortalRow: ONE predicate, on the phase row, so the definition can be
    // asserted rather than re-derived in three places. A row is immortal when
    // the EARLY cap fired (cap:true and capAt under the clock cap), it was the
    // STABLE-BUILD arm (not the saturation deadlock arm), and the run had
    // corner-anchored (parked ticks > 0). Nothing else — `t`, `ph`, `cause`
    // are deliberately not consulted: a capped run's cause is the ladder.
    function isImmortalRow(row) {
        if (!row || row.cap !== true) return false;
        const capS = (CONFIG.deepHell && CONFIG.deepHell.runCapS) || 0;
        if (!(typeof row.capAt === 'number' && capS > 0 && row.capAt < capS)) return false;
        if (row.why === 'saturated') return false;
        return (row.parkT || 0) > 0;
    }
    // v6.128.0 THE RESET FLOOR. A phase row's `v` is scriptTag() — the
    // dotted X.Y.Z version, optionally followed by '+crown' and/or
    // '+<char>'. Compares only that leading X.Y.Z against
    // graduation.immortalEpochVersion (stamped once, at the count reset —
    // see CONFIG.graduation's comment), so a row booked before the reset,
    // still sitting in the rolling 240-row phase-audit window, is never
    // counted toward the fresh target. No floor stamped (a store from
    // before this existed) counts every row, same as always.
    function versionAtOrAfterEpoch(v) {
        const floor = graduation && graduation.immortalEpochVersion;
        if (!floor || typeof v !== 'string') return true;
        const a = v.split('+')[0].split('.').map(Number);
        const b = floor.split('+')[0].split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            const av = a[i] || 0, bv = b[i] || 0;
            if (av !== bv) return av > bv;
        }
        return true;   // equal versions -> counts
    }
    // v6.126.0 THE COUNT. Immortal rows on a character's own tag in the
    // phase audit, order irrelevant — a death neither resets nor counts.
    // The tag suffix is how the phase audit already keys characters ('+joe'
    // etc.), so no new field is needed. v6.128.0: also gated on
    // versionAtOrAfterEpoch — see its comment.
    function immortalRowsCount(char, rows) {
        const suffix = '+' + char;
        let n = 0;
        const list = rows || (phaseAudit && phaseAudit.rows) || [];
        for (let i = 0; i < list.length; i++) {
            const r = list[i];
            if (typeof r.v === 'string' && r.v.endsWith(suffix) && isImmortalRow(r) && versionAtOrAfterEpoch(r.v)) n++;
        }
        return n;
    }
    // The figure the rule reads: the persisted counter (booked per run in
    // finishRun, immune to the audit's 240-row eviction) or the rows still
    // in the audit, whichever is larger — the latter backfills rows booked
    // before the counter existed.
    function immortalCount(char, rows) {
        const booked = (graduation && graduation.counts && graduation.counts[char]) || 0;
        return Math.max(booked, immortalRowsCount(char, rows));
    }
    // Book one finished run against the counter. Called from finishRun after
    // the phase row is appended, so the audit-derived figure already includes
    // this run and the max() below cannot double-count it.
    // v6.132.0 MULTI-TAB. `graduation` is read once at page load and written
    // back WHOLE, so two tabs each hold a stale copy and the last writer wins
    // — one tab's run counts, ledger marks and rotation cursor silently
    // overwrite the other's. `beginTrial` already re-reads the learn store
    // for exactly this reason ("re-read shared storage to pick up other
    // tabs' progress before this run counts itself in"); the graduation
    // store never did. Caught in a live 6.131.0 paste: `compare` showed 4/8/6
    // runs per character on 6.131.0 while the race ledger read 1/1/1, and
    // minguk's runRange [618,621] covered four run numbers for eight counted
    // runs. Adopted only when the stored blob carries the current reset guard,
    // so a pre-reset blob can never be pulled back in.
    function reloadGraduation() {
        try {
            const s = JSON.parse(localStorage.getItem(GRADUATION_KEY) || 'null');
            if (s && typeof s === 'object' && s.resetEpoch1321) graduation = s;
        } catch (e) { }
    }
    function bookImmortal(row) {
        try {
            if (!row || typeof row.v !== 'string') return;
            const m = row.v.match(/\+([a-z]+)$/);
            if (!m || !CHARS[m[1]]) return;
            const c = m[1];
            reloadGraduation();   // v6.132.0: another tab may have booked runs since this page loaded
            graduation.counts = graduation.counts || {};
            const prev = graduation.counts[c] || 0;
            graduation.counts[c] = Math.max(prev + (isImmortalRow(row) ? 1 : 0), immortalRowsCount(c));
            // v6.131.0 THE RACE LEDGER (user: "Is there a way to find out who
            // reached immortal build the fastest and with the fewest runs").
            // The counter alone cannot answer that: it says WHERE a character
            // is, never how much it cost to get there. `compare` gets close
            // (its per-version rows carry per-character `runs`, and the
            // 6.130.0 reset coincides with a version bump so the rows happen
            // to align with the epoch) — but that alignment breaks the moment
            // any version ships mid-race, which in this project is the norm.
            // So each character keeps its own epoch ledger here, in the store
            // the reset already owns: runs played since the ledger opened, and
            // for every immortal build the run number, the wall clock, and the
            // capAt that proved it. `marks[N]` is therefore the exact answer
            // to "reached N in how many runs, and when".
            const P = graduation.progress = graduation.progress || {};
            let pr = P[c];
            const nowIso = new Date().toISOString();
            if (!pr) {
                pr = P[c] = { runs: 0, immortal: 0, startedAt: nowIso, startRun: (learn && learn.runs) || 0, marks: {} };
                // Opened mid-epoch (this version shipping after the reset it
                // measures): adopt whatever the counter already holds so the
                // target stays honest, and record that those builds' run
                // numbers are NOT in the ledger.
                if (prev > 0) { pr.immortal = prev; pr.adopted = prev; }
            }
            pr.runs++;
            pr.lastAt = nowIso;
            pr.careerRun = (learn && learn.runs) || pr.careerRun || 0;
            // Read the mark off the COUNTER, not off isImmortalRow, so the
            // ledger cannot drift from the number it is measuring (the counter
            // also backfills from the audit, and can rise by more than one).
            const after = graduation.counts[c];
            if (after > pr.immortal) {
                for (let k = pr.immortal + 1; k <= after; k++) {
                    pr.marks[String(k)] = { run: pr.runs, careerRun: pr.careerRun, at: nowIso,
                        capAt: (k === after && row.capAt != null) ? Math.round(row.capAt) : null,
                        t: (k === after && row.t != null) ? Math.round(row.t) : null };
                }
                pr.immortal = after;
            }
            localStorage.setItem(GRADUATION_KEY, JSON.stringify(graduation));
        } catch (e) { }
    }
    // The pin as the rule sees it: the configured pin unless that character
    // has graduated, in which case the first character in `order` that has
    // not. Returns { char, graduatedNow } and persists a NEW graduation the
    // moment the streak is met — this is called once per run start, so the
    // rule fires the run it becomes true.
    // Persist a freshly-met graduation. Shared by the pinned and the
    // round-robin paths so both record the same thing the same way.
    function recordGraduation(c, need, count) {
        const rows = (phaseAudit.rows || []).filter(r => typeof r.v === 'string' && r.v.endsWith('+' + c) && isImmortalRow(r)).slice(-need);
        graduation.graduated[c] = {
            at: new Date().toISOString(), version: scriptTag(), count,
            rows: rows.map(r => ({ t: r.t, capAt: r.capAt, parkT: r.parkT }))
        };
        try { localStorage.setItem(GRADUATION_KEY, JSON.stringify(graduation)); } catch (e) { }
    }
    // v6.130.0 ROUND-ROBIN (user: "rotate the character per run instead of
    // sticking with one character until it reaches the 10 immortal build
    // count" — and, when the first cut dropped graduates out of the cycle:
    // "no I want them to rotate on every session regardless of whether
    // they graduated"). So: the pick is simply the next character in
    // `order` after the last one played, cyclically, EVERY run — a
    // character that has reached the bar keeps playing. Reaching ten is
    // still recorded (graduation, the 🎓 in the summary, the report's
    // `graduated` record) because that is the goal being measured, but it
    // no longer changes who plays. The cursor (`graduation.lastPlayed`) is
    // persisted with the rest of the store so a reload mid-cycle carries
    // on rather than starting over at order[0]. `preview` computes the
    // same answer without moving the cursor or recording anything — the
    // report's `playing` field.
    function rotationPick(order, need, preview) {
        let graduatedNow = null;
        for (const c of order) {
            if (graduation.graduated[c]) continue;
            const count = immortalCount(c);
            if (count >= need && !preview) {
                recordGraduation(c, need, count);
                graduatedNow = graduatedNow || c;
                log('🎓 IMMORTAL STOP RULE:', c, 'reached', count, 'immortal builds — recorded; the rotation continues');
            }
        }
        const last = graduation.lastPlayed;
        const start = order.indexOf(last);   // -1 when nobody has played yet, or last is no longer in `order`
        const pick = order[(start + 1) % order.length];
        if (!preview) {
            graduation.lastPlayed = pick;
            try { localStorage.setItem(GRADUATION_KEY, JSON.stringify(graduation)); } catch (e) { }
        }
        return { char: pick, graduatedNow };
    }
    function graduationPick() {
        reloadGraduation();   // v6.132.0: the rotation cursor is shared state too
        const Gd = CONFIG.graduation || {};
        const pin = CONFIG.preferredBartender;
        const need = Gd.count != null ? Gd.count : Gd.streak;   // `streak` accepted as a legacy alias
        const order = Array.isArray(Gd.order) ? Gd.order.filter(c => CHARS[c]) : [];
        if (Gd.enabled && need > 0 && Gd.rotate && order.length) {
            graduation.graduated = graduation.graduated || {};
            return rotationPick(order, need, false);
        }
        if (!Gd.enabled || !(need > 0) || !pin || !CHARS[pin]) return { char: pin, graduatedNow: null };
        graduation.graduated = graduation.graduated || {};
        // Whoever the pin currently resolves to is the one under test.
        let cur = pin;
        if (graduation.graduated[cur]) {
            const next = order.find(c => !graduation.graduated[c]);
            cur = next || null;
        }
        let graduatedNow = null;
        if (cur) {
            const count = immortalCount(cur);
            if (count >= need && !graduation.graduated[cur]) {
                recordGraduation(cur, need, count);
                graduatedNow = cur;
                const next = order.find(c => !graduation.graduated[c]);
                log('🎓 IMMORTAL STOP RULE:', cur, 'reached', count, 'immortal builds —',
                    next ? 'moving to ' + next : 'every character in the order has graduated');
                cur = next || null;
            }
        }
        return { char: cur, graduatedNow };
    }
    // The report's view of the rule. `streaks` is live, `graduated` is the
    // persisted record; `next` is who the pin resolves to right now.
    function graduationStatus() {
        const Gd = CONFIG.graduation || {};
        const order = Array.isArray(Gd.order) ? Gd.order : [];
        const counts = {};
        for (const c of order) counts[c] = immortalCount(c);
        const graduated = (graduation && graduation.graduated) || {};
        const need = Gd.count != null ? Gd.count : Gd.streak;
        const rotate = !!(Gd.enabled && need > 0 && Gd.rotate && order.length);
        // v6.130.0: under the round-robin, `playing` is who the NEXT pick
        // lands on (a preview — nothing is moved or recorded here), and
        // `lastPlayed` is the persisted cursor it advances from.
        const next = !Gd.enabled ? CONFIG.preferredBartender
            : rotate ? rotationPick(order.filter(c => CHARS[c]), need, true).char
            : (graduated[CONFIG.preferredBartender] ? (order.find(c => !graduated[c]) || null) : CONFIG.preferredBartender);
        // v6.131.0 THE RACE: who is reaching the bar fastest, and at what
        // cost. Three different senses of "fastest", all reported rather
        // than collapsed into one, because they can disagree: `runsTo` is
        // the run number the target landed on (fewest runs = most
        // efficient), `hoursTo` is wall clock from the ledger opening,
        // and `medianCapAt` is how quickly each build proved itself in
        // GAME seconds (a low median means the early cap fires sooner —
        // the build is immortal earlier in the run, not just eventually).
        const prog = (graduation && graduation.progress) || {};
        const medOf = a => { if (!a.length) return null; const x = a.slice().sort((u, v) => u - v);
            return x.length % 2 ? x[(x.length - 1) / 2] : Math.round((x[x.length / 2 - 1] + x[x.length / 2]) / 2); };
        const race = order.filter(c => CHARS[c]).map(c => {
            const p = prog[c];
            if (!p) return { char: c, runs: 0, immortal: counts[c] || 0, perRun: null, runsTo: null, hoursTo: null, medianCapAt: null, ledger: false };
            const hit = p.marks && p.marks[String(need)];
            const caps = Object.values(p.marks || {}).map(m => m && m.capAt).filter(v => typeof v === 'number');
            return {
                char: c, runs: p.runs || 0, immortal: p.immortal || 0,
                perRun: p.runs ? +((p.immortal || 0) / p.runs).toFixed(3) : null,
                runsTo: hit ? hit.run : null,
                hoursTo: hit && p.startedAt ? +(((new Date(hit.at) - new Date(p.startedAt)) / 3.6e6)).toFixed(2) : null,
                medianCapAt: medOf(caps),
                adopted: p.adopted || 0,   // builds counted before this ledger existed — their run numbers are unknown
                ledger: true
            };
        });
        const done = race.filter(x => x.runsTo != null);
        return {
            enabled: !!Gd.enabled, countNeeded: need, order, pin: CONFIG.preferredBartender,
            rotate, lastPlayed: rotate ? (graduation && graduation.lastPlayed) || null : undefined,
            counts, graduated, playing: next,
            race,
            fewestRuns: done.length ? done.slice().sort((a, b) => a.runsTo - b.runsTo)[0].char : null,
            fastestWall: done.length ? done.slice().sort((a, b) => a.hoursTo - b.hoursTo)[0].char : null,
            fastestBuild: (() => { const w = race.filter(x => x.medianCapAt != null); return w.length ? w.slice().sort((a, b) => a.medianCapAt - b.medianCapAt)[0].char : null; })(),
            note: 'immortal = cap:true AND capAt < runCapS (the EARLY cap) AND why != saturated (the stable-build arm) AND parkT > 0 (corner-anchored). counts are TOTAL immortal builds per character (persisted; deaths in between neither reset nor count). ' +
                (rotate ? 'rotate=true (v6.130.0): every run start picks the next character in `order` after `lastPlayed`, graduated or not — reaching the bar is recorded (🎓) but never changes who plays. `playing` is who the next run will be. '
                        : 'When `playing` is null every character in `order` has graduated. ') +
                'race (v6.131.0) answers who got there cheapest: `runs`/`immortal`/`perRun` are this epoch per character, `runsTo` is the run the TARGET landed on (fewest = most efficient), `hoursTo` the wall clock for it, `medianCapAt` the median game-second at which each build proved itself (lower = immortal sooner in the run). `adopted` counts builds booked before the ledger existed — their run numbers are unknown, so a non-zero `adopted` makes that character\'s `runsTo` a LOWER BOUND, not an exact figure.'
        };
    }

    function chooseBartender() {
        let b = null;
        // v6.125.0: the pin is honoured through the immortal stop rule — a
        // graduated character hands the pin to the next in CONFIG.graduation.order.
        const gp = safe(() => graduationPick(), { char: CONFIG.preferredBartender, graduatedNow: null });
        if (gp.char && CHARS[gp.char]) b = gp.char;
        else if (CONFIG.preferredBartender && CHARS[CONFIG.preferredBartender] && !(CONFIG.graduation && CONFIG.graduation.enabled)) b = CONFIG.preferredBartender;
        else if (Array.isArray(CONFIG.bartenderRotation) && CONFIG.bartenderRotation.length) b = nextRotationChar();
        if (!b) {
            let best = BARTENDERS[0], bestScore = -Infinity;
            for (const c of BARTENDERS) {
                const s = ucbScore(BARTENDER_TO_BASE_ATTACK[c]) + Math.random() * 0.05;
                if (s > bestScore) { bestScore = s; best = c; }
            }
            b = best;
        }
        // v6.85.0: switching bartender switches the learned store, the
        // posture profile and the version tag for everything that follows
        // (beginTrial reloads `learn` from the new key).
        if (b !== activeChar) { activeChar = b; learn = loadLearn(); log('bartender →', b, '| store', learnKey(), '| tag', scriptTag()); }
        return b;
    }

    function worldPickerVisible() {
        return [...document.querySelectorAll('.wb-play, .char, [onclick*="startGame"], [onclick*="selectWorldBartender"]')]
            .some(el => visible(el));
    }
    // Start the run with the bartender the rotation / preference / bandit
    // chose. startGame(charKey) takes the key directly (verified from its
    // source), so we call it ourselves instead of clicking the game's START
    // button, whose onclick carries whichever bartender the player last
    // highlighted. selectWorldBartender() is called first so the game's
    // own highlight/save state agrees with what we start.
    function startWithBartender() {
        const b = chooseBartender();
        bartenderThisRun = b;
        if (hasGame('selectWorldBartender')) safe(() => window.selectWorldBartender(b));
        if (hasGame('startGame')) { callGame('startGame', b); startRun(); return true; }
        const el = findByText(new RegExp('^' + b + '$', 'i'));
        if (el) { clickEl(el); startRun(); return true; }
        return false;
    }

    // Hell detection is latched ONLY while actually playing. The results
    // screen ("CLOSING TIME", leaderboard, enter-hell buttons) contains the
    // word HELL even after perfectly normal runs, so scanning it there
    // produced false stops. At game over we trust only the latched flag
    // and the game's own lexical flags — never the results-screen text.
    function hellLexicalFlag() {
        return safe(() => hell, undefined) === true ||
            safe(() => hellMode, undefined) === true ||
            safe(() => isHell, undefined) === true ||
            safe(() => inHell, undefined) === true;
    }
    function latchHellDuringPlay() {
        if (hellDetected) return;
        if (hellLexicalFlag()) { hellDetected = true; hellEnteredAt = gameMs(); log('HELL run latched (lexical flag)'); return; }
        // v6.126.0 THE FORCED LAYOUT EVERY 260 ms. The HUD-text fallback
        // below reads `innerText` on every top-level body child, and
        // innerText is layout-dependent — the browser must flush style and
        // layout synchronously to answer it. That ran four times a wall-
        // second for the whole 20-minute day (hell is not latched yet, so
        // the fast path above never returns), in the middle of a rAF-driven
        // game loop that redraws its HUD every frame: a forced reflow per
        // 260 ms is exactly the shape of the stutter the user reports, and
        // it is independent of game speed.
        //
        // The fallback exists for a page that does not expose the `hell`
        // binding at all. When the binding EXISTS and reads false, it is the
        // game's own state and out-ranks a text scan — the same rule this
        // project applies everywhere ("gate on the stat the game computes,
        // never on a rendering of it"). So the scan now runs only when the
        // lexical flag is genuinely absent.
        if (typeof safe(() => hell, undefined) === 'boolean') return;
        if (CONFIG.hellModeRegex.test(bodyText())) { hellDetected = true; hellEnteredAt = gameMs(); log('HELL run latched (HUD text)'); }
    }

    function looksLikeNameEntry() {
        return [...document.querySelectorAll('input')].some(visible);
    }
    // v6.88.0 AUDIT S2: never press a control that sits on a form with a live
    // text input — that is the logbook name entry, and a bot entry in it is
    // exactly what the crown rules forbid.
    function notNameForm(el) {
        try {
            if (!el) return false;
            const idc = (el.id || '') + ' ' + (el.className || '');
            if (/save|submit|enter\s*name/i.test(idc)) return false;
            // No visible text input on screen: this is not the logbook.
            if (!looksLikeNameEntry()) return true;
            // A name form IS up. Refuse the SUBMIT vocabulary outright — an
            // ancestor walk is not enough, because the button is usually a
            // SIBLING of the input rather than its parent, and a flat layout
            // then reads as safe. Navigation labels stay allowed, because
            // leaving the screen is exactly what the bot needs to do here.
            const t = (el.textContent || '').trim();
            if (/^(ok|okay|confirm|yes|submit|save|done|enter|register|기록|확인|저장)\b/i.test(t)) return false;
            let n = el, hops = 0;
            while (n && hops++ < 4) {
                if (n.querySelectorAll && [...n.querySelectorAll('input')].some(visible)) return false;
                n = n.parentElement;
            }
        } catch (e) { }
        return true;
    }

    // Did this run beat EVERY entry in the logbook (rank #1)? The book shows
    // "DOWN <n>" and "₩<amount>" per entry; we compare our downs and sales
    // against the best of each. An explicit NEW RECORD banner also counts.
    function parseMoneyToken(t) {
        const m = String(t).replace(/,/g, '').match(/([\d.]+)\s*([kKmM]?)/);
        if (!m) return null;
        let v = parseFloat(m[1]);
        if (/k/i.test(m[2])) v *= 1e3;
        if (/m/i.test(m[2])) v *= 1e6;
        return v;
    }
    function isTopRecord(stats) {
        if (!stats) return false;
        let text = bodyText();
        // strip OUR OWN stats header so we never compare against ourselves
        text = text
            .replace(/TIME\s*SURVIVED[^0-9]*(?:\d{1,3}:)?\d{1,2}:\d{2}/i, ' ')
            .replace(/CUSTOMERS\s*DOWNED[^\d]*[\d,]+/i, ' ')
            .replace(/TODAY['’]?S\s*SALES[^₩\d]*₩?\s*[\d,.]+\s*[kKmM]?/i, ' ');
        // Board entries, in every observed format:
        //   times "107:01", downs "DOWN 397" or "42.3k", sales "₩74.9M"
        const times = [...text.matchAll(/\b(\d{1,3}):(\d{2})\b/g)].map(m => (+m[1]) * 60 + (+m[2]));
        const downs = [
            ...[...text.matchAll(/\bDOWN\s+([\d,]+)\b/gi)].map(m => +m[1].replace(/,/g, '')),
            ...[...text.matchAll(/(?<!₩)(?<!₩\s)\b(\d+(?:\.\d+)?)k\b/gi)].map(m => Math.round(parseFloat(m[1]) * 1000))
        ];
        const sales = [...text.matchAll(/₩\s*([\d,.]+\s*[kKmM]?)/g)].map(m => parseMoneyToken(m[1])).filter(v => v != null);
        if (times.length || downs.length || sales.length) {
            // NUMBERS ARE THE ONLY TRUTH. The decorative "TOP RECORD / RANK 1"
            // frame is ALWAYS on the hell results screen — it shows the
            // standing champion, not our result. Rank #1 means beating EVERY
            // listed entry outright on at least one column.
            // USER RULE: the crown is TIME. When the board shows survival
            // times (the hell ranking always does), ONLY beating the best
            // time counts — downs/sales records keep the bot on RETRY.
            if (times.length) return (stats.time || 0) > Math.max(...times);
            const beatD = downs.length ? (stats.downs || 0) > Math.max(...downs) : false;
            const beatS = sales.length ? (stats.sales || 0) > Math.max(...sales) : false;
            return beatD || beatS;
        }
        // No numbers at all — only an explicit NEW RECORD banner counts.
        // ("RANK 1" / "TOP RECORD" are permanent screen decorations.)
        return /NEW\s*RECORD/i.test(text);
    }

    // Click an element by what its inline onclick HANDLER does, not its text.
    // The game wires screens with onclick="enterHell()" etc., and some
    // controls are images with no text at all.
    function clickByHandler(re) {
        for (const el of document.querySelectorAll('[onclick]')) {
            if (!visible(el)) continue;
            if (re.test(el.getAttribute('onclick') || '')) return clickEl(el);
        }
        return false;
    }

    // Click an element identified by its id/class (image buttons and styled
    // divs often have no text and no inline onclick attribute).
    function clickByIdClass(re) {
        for (const el of document.querySelectorAll('[id], [class]')) {
            if (!visible(el)) continue;
            const sig = (el.id || '') + ' ' + String(el.className || '');
            if (!re.test(sig)) continue;
            if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'IMG' ||
                el.onclick || el.getAttribute('onclick') || /btn|button|door|entry/i.test(sig)) {
                return clickEl(el);
            }
        }
        return false;
    }

    // When every way of finding the hell entry fails, record what WAS on
    // screen so diagnostics can show exactly what the bot saw.
    function captureGiveUp(tag) {
        try {
            const items = [];
            for (const el of document.querySelectorAll('button, a, [role="button"], [onclick], .btn, img')) {
                if (!visible(el)) continue;
                items.push({
                    text: (el.textContent || '').trim().slice(0, 40),
                    onclick: ((el.getAttribute && el.getAttribute('onclick')) || '').slice(0, 50),
                    sig: (el.id ? '#' + el.id : '') + (el.className ? ' .' + String(el.className).slice(0, 30) : ''),
                    tag: el.tagName
                });
                if (items.length >= 20) break;
            }
            lastGiveUp = { where: tag, state: G.state, controls: items };
            console.warn('[PineBot] hell-entry search gave up at', tag, '— visible controls:', items);
        } catch (e) { }
    }

    // AFTER HOURS → HELL routing, usable from the plaza OR the closing-time
    // screen. Only an UNAMBIGUOUS entrance click flags the run as hell — a
    // loose /hell/ match might be a leaderboard tab, so it clicks without
    // flagging (the in-run HUD/lexical latch confirms real hell entry).
    function tryAfterHoursHell() {
        if (!CONFIG.autoEnterHell) return false;
        // v6.88.0 AUDIT C3. `🔥 hell` also matches #hellToggleBtn, the results
        // screen's LEADERBOARD toggle — which is present after perfectly normal
        // runs. The /toggle/ exclusion existed only on the loose fallback below
        // (which does NOT latch hellDetected); the dangerous path had none. A
        // stray toggle click therefore set pendingHellEntry, and startRun then
        // scored the whole NEXT day run under hell rules, collecting
        // hellEntered + the unbounded hellTimeBonus for a run that never left
        // the day. Same exclusion, applied where it matters.
        const notToggle = el => el && !/toggle|board|tab|switch/i.test(
            (el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('onclick') || ''));
        if (clickTextIf(/enter\s*hell|go\s*to\s*hell|🔥\s*hell/i, notToggle) ||
            clickByHandler(/enter\s*_?hell|enterhell/i) ||
            clickByIdClass(/hell(btn|button|door|entry|enter)|enterhell/i)) {
            hellDetected = true;
            pendingHellEntry = true;
            setStatus('AFTER HOURS — entering HELL');
            return true;
        }
        if (clickText(/after[\s-]*hours/i) ||
            clickByHandler(/after\s*_?hours?|afterhour/i) ||
            clickByIdClass(/after[-_]?hours?/i)) {
            setStatus('going AFTER HOURS');
            return true;
        }
        // Loose fallback — but NEVER the leaderboard toggle (#hellToggleBtn /
        // toggleHellBoard), which merely switches the visible score board.
        const loose = findByText(/\bhell\b/i);
        if (loose && !/toggle/i.test((loose.id || '') + (loose.getAttribute('onclick') || ''))) {
            clickEl(loose);
            setStatus('hell option clicked (unconfirmed)');
            return true;
        }
        return false;
    }

    // Shared game-over logic: stop for manual name entry on a record the user
    // cares about; otherwise leave the logbook untouched and restart.
    // The live rank-1 hell time, straight from the game's own board.
    function liveCrownTimeS() {
        try {
            const b = JSON.parse(localStorage.getItem('paco_bdh_time') || '[]');
            const best = b.map(e => +e.time).filter(t => isFinite(t) && t > 0).sort((x, y) => y - x)[0];
            if (best) return best;
        } catch (e) { }
        return CONFIG.crownTimeS;
    }

    function recordStopReason() {
        // CROWN THRESHOLD first — it does not depend on the board rendering,
        // on the name prompt being detected, or on our own row being stripped
        // out of the parse. A ranked hell run past the known #1 time is a #1.
        const ct = liveCrownTimeS() || CONFIG.crownTimeS;
        if (CONFIG.stopOnHellRecord && ct && lastRunStats && (lastRunStats.time || 0) > ct &&
            (hellRunEnded || hellLexicalFlag())) {
            return 'HELL #1 — beat the crown time (' + Math.round(lastRunStats.time) + 's > ' + ct + 's) — type your name yourself';
        }
        if (!looksLikeNameEntry()) return null;
        // Only an actual #1 score stops the bot — a name-entry prompt alone
        // does not. Hell status is judged on the run that just ENDED
        // (hellRunEnded), not the live flag — clicking a hell entrance on
        // this same screen must not retroactively flag a normal run.
        const top = isTopRecord(lastRunStats);
        if (!top) return null;
        if (CONFIG.stopOnHellRecord && (hellRunEnded || hellLexicalFlag()))
            return 'HELL #1 RECORD — type your name yourself';
        if (CONFIG.stopOnTopRecord)
            return 'TOP RECORD (#1) — type your name yourself';
        return null;
    }

    // Per-state handlers. Each returns true if it acted.
    const STATE_HANDLERS = {
        title() {
            return !!callFirst(['goSelect']) || clickText(/^(start|play)/i);
        },
        select() { return startWithBartender() || false; },
        world() {
            // v6.85.1 LIVE-VERIFIED: the 'world' screen IS the bartender
            // picker. Its START button (.wb-play) is hard-wired to
            // startGame('<highlighted world bartender>') — minguk by default —
            // so clicking "start" here silently ignored the rotation. If a
            // start control is on screen, start with OUR bartender instead;
            // otherwise this is the post-start crawl: reveal/skip it.
            if (worldPickerVisible() && startWithBartender()) return true;
            return !!callFirst(['revealGame', 'skipIntro']) || clickText(/^(enter|go|start|open)/i);
        },
        intro() {
            return !!callFirst(['skipIntro', 'revealGame']) || clickText(/^skip/i);
        },
        menu() {
            return !!callFirst(['resumeGame']) || clickText(/resume|continue/i);
        },
        // v6.87.5: the movement loop owns play, but the fusion prompt is a
        // DOM overlay that leaves G.state on 'playing' — so it has to be
        // checked here or it is never seen at all.
        playing() { return takeCraftPrompt(); },
        levelup() {
            // v6.88.1 L3: this handler now OWNS the stall. It used to fall
            // through to `clickCardByIndex(0)`, which returns false whenever
            // cardElements() matches none of its six selectors (it matches none
            // in the live DOM) — and a false here hands the screen to the
            // generic stuck-breaker, which proceeded to click the settings gear,
            // the recipe book, the mute toggle and pause, in order, forever.
            // A level-up is never resolved by any of those, so the breaker must
            // not see this state at all: claim the tick either way.
            if (handleLevelUp()) { levelupStuckAt = 0; return true; }
            const now = Date.now();
            if (!levelupStuckAt) levelupStuckAt = now;
            if (now - levelupStuckAt > 2500) {
                // Held for 2.5 s with nothing taken. Force the latch open and
                // eat the first card — a suboptimal pick costs one card; a
                // wedged level-up costs the run.
                levelupStuckAt = now;
                lastPoolSig = null; lastPoolRef = null;
                log('level-up wedged — forcing a pick');
                setStatus('level-up wedged — forced pick');
                if (hasGame('pickUpgrade')) { callGame('pickUpgrade', 0); return true; }
                clickCardByIndex(0) || clickText(/\+\s*\d|lv\.?\s*\d/i);
            }
            return true;
        },
        craft() {
            // ── v6.122.0 THE AUDIT C1 DEFECT WAS FIXED IN ONE PLACE ONLY ────
            // takeCraftPrompt was rewritten to count a craft only once the
            // prompt DISAPPEARS, and it records why: "ten seconds booked 38,
            // and `milestones.craft * 38 = 1.90` is larger than the entire
            // time+downs+sales contribution to the reward ... the optimiser
            // converged on whichever vector happened to be playing while a
            // prompt was stuck." This handler kept the original shape —
            // increment BEFORE the call, discard callGame's {ok}, no dedupe —
            // while handleScreens dispatches every 260 ms for as long as the
            // state holds. Same defect, same cost, other call site.
            //
            // Now: only count when the game actually accepted the call, and
            // never more than once per entry into the state.
            const choices = safe(() => window._craftPool, null) || safe(() => window._cpool, null);
            const book = (r) => { if (r && r.ok !== false && !craftStateBooked) { craftStateBooked = true; craftsThisRun++; } return true; };
            if (Array.isArray(choices) && choices.length && hasGame('pickCraftChoice')) {
                const best = choices.map(scoreCard).sort((a, b) => b.score - a.score)[0];
                if (best) {
                    runPicks.push(best.name);
                    runPickCounts[best.name] = (runPickCounts[best.name] || 0) + 1;
                    ownedLevels[best.name] = Math.max(ownedLevels[best.name] || 0, 1);
                    return book(callGame('pickCraftChoice', best.index));
                }
            }
            if (hasGame('confirmCraft')) return book(callGame('confirmCraft'));
            if (hasGame('pickCraftChoice')) return book(callGame('pickCraftChoice', 0));
            return takeCraftPrompt();
        },
        notice() {
            return !!callFirst(['closeNotice']) || clickText(/got it|ok|close|continue/i);
        },
        tip() {
            return !!callFirst(['closeTip']) || clickText(/cheers|thanks|got it|ok|close/i);
        },
        tipreward() {
            return !!callFirst(['closeTip', 'closeNotice']) || clickText(/cheers|thanks|got it|ok|close/i);
        },
        over() {
            if (runActive) { deathSnapshot = deathSnapshot || snapshotStats(); finishRun(); }
            releaseAll();
            const reason = recordStopReason();
            if (reason) {
                stopBot(reason);
                // Freeze the game too — nothing should keep running behind
                // the record screen while it waits for the user's name.
                if (hasGame('pauseGame')) callGame('pauseGame');
                return true;
            }
            // Hell entry happens at the finale overlay during 'playing', not
            // here. Never hunt for it after a HELL run just ended (the 🔥 HELL
            // heading on its results screen is not an entrance).
            if (!hellRunEnded && hellTries < 2) {
                if (tryAfterHoursHell()) { hellTries++; return true; }
                captureGiveUp('over-screen');   // audit fix: was dead code — reports the controls seen when entry fails
            }
            // Ordinary run: never touch the NAME/SAVE form — no bot entries in
            // the logbook. RETRY is the fastest path into the next run.
            return clickText(/^\W*retry\b/i) || !!callFirst(['backToTitle']) ||
                clickText(/again|continue|title|back/i);
        },
        highscore() {
            // v6.88.0 AUDIT C5. over() opens with finishRun()+releaseAll(); this
            // peer terminal state did neither, yet reads lastRunStats through
            // recordStopReason. If the game can reach 'highscore' without
            // passing 'over', the run was never credited, the crown check
            // compared the PREVIOUS run's time, keys stayed held, and runActive
            // stayed true — so the next run inherited ownedLevels, supersMade,
            // hellDetected and runStart, and two runs were eventually credited
            // as one. Idempotent: finishRun is a no-op once runActive is false.
            if (runActive) {
                deathSnapshot = deathSnapshot || snapshotStats();
                finishRun();
                releaseAll();
            }
            const reason = recordStopReason();
            if (reason) {
                stopBot(reason);
                // Freeze the game too — nothing should keep running behind
                // the record screen while it waits for the user's name.
                if (hasGame('pauseGame')) callGame('pauseGame');
                return true;
            }
            // Non-record run: click the REAL RETRY button first — it closes
            // the score overlay properly. API navigation (backToTitle) can
            // flip the internal state while the overlay stays up, leaving the
            // game running "behind" the high score screen.
            return clickText(/^\W*retry\b/i) || clickText(/again|continue/i) ||
                !!callFirst(['backToTitle']) || clickTextIf(/^(title|back|ok|menu)$/i, notNameForm);
        },
        plaza() {
            // VERIFIED: 'plaza' is the SOCIAL chat hub (openPlaza/plazaSay),
            // not the day-end flow — hell entry happens at the #finaleMsg
            // overlay during 'playing'. If we somehow land here, just leave.
            return !!callFirst(['closePlaza', 'backToTitle']) || clickText(/close|back|exit|title/i);
        }
    };

    function handleScreens() {
        const st = G.state;
        const now = Date.now();

        if (st !== lastState) {
            log('state:', lastState, '->', st);
            lastState = st;
            lastStateAt = now;
            stuckTries = 0;
            hellTries = 0;
            if (st === 'playing' && !runActive) startRun();
            else if (st === 'playing' && runActive) pendingHellEntry = false;  // same-run hell continuation: flag already latched
            if (st !== 'playing') releaseAll();
        }


        if (st == null) return domFallbackScreens();

        // A level-up pool can appear while `state` still reads 'playing' on some frames.
        if (st === 'playing') {
            latchHellDuringPlay();   // hell is only ever detected mid-run, never from menus

            // v6.87.6 (user: "always pick make black vermouth"). The fusion
            // prompt lives HERE, not in STATE_HANDLERS. The 'playing' branch
            // of handleScreens returns before the STATE_HANDLERS dispatch ever
            // runs, so 6.87.5's `playing() { return takeCraftPrompt(); }` was
            // dead code — a gate that never opens, and the unit test missed it
            // by calling the handler directly instead of going through
            // handleScreens(). Checked first: the prompt pauses the field, so
            // nothing else in this branch can matter while it is up.
            if (takeCraftPrompt()) return true;

            // THE REAL AFTER-HOURS FLOW (verified from the live game):
            // finale prompts appear while state is STILL 'playing', and their
            // continue buttons carry the class `fin-continue`. The chase
            // prompt (JOE SHOWS UP → START RUNNING) has one; the day-end
            // choice has TWO — CLOCK OUT (decline → gameOver) and
            // AFTER-HOURS · HELL (ranked + Rainbow) → enterHell(), which
            // continues THIS run in hell. Click the BUTTON, never the
            // headline, and never press the decline while auto-hell is on.
            // FAILSAFE (live-diagnosed: 40+ minute runs STILL landing in
            // unranked after-hours): if the finale minute arrives and hell
            // has not been latched, call the game's own enterHell() directly
            // — and snapshot whatever the screen shows for post-mortem.
            const gtFin = typeof G.gameTime === 'number' ? G.gameTime : 0;
            if (CONFIG.autoEnterHell && !hellDetected && gtFin >= 1200 && gtFin < 1320 && hellTries < 4) {
                if (hasGame('enterHell')) {
                    hellTries++;
                    captureGiveUp('finale-failsafe');
                    if (callGame('enterHell').ok) {
                        hellDetected = true; hellEnteredAt = gameMs(); dayClearedThisRun = true;
                        setStatus('FAILSAFE: enterHell() called directly at finale');
                        return true;
                    }
                }
            }
            const fmsg = document.getElementById('finaleMsg');
            const fmsgOpen = fmsg && !fmsg.classList.contains('hidden');
            let finBtns = [...document.querySelectorAll('.fin-continue')].filter(visible);
            if (!finBtns.length && fmsgOpen) {
                finBtns = [...fmsg.querySelectorAll('button, [onclick], .btn, a')].filter(visible);
                if (!finBtns.length) finBtns = [...fmsg.children].filter(el => visible(el) && (el.textContent || '').trim());
            }
            if (finBtns.length) {
                const ctxText = finBtns.map(b => b.textContent || '').join(' ') +
                    ' ' + (fmsgOpen ? fmsg.textContent || '' : '');
                // ranked-entry button ONLY: 'after' alone also matches the
                // NORMAL after-hours button — that one word cost two
                // 56-minute marathons their crown eligibility.
                const hellBtn = finBtns.find(b =>
                    /hell|🔥/i.test(b.textContent || '') ||
                    /enterhell/i.test(b.getAttribute('onclick') || ''));
                if (/hell|after[\s-]*hours|🔥/i.test(ctxText)) {
                    // Day-end choice screen.
                    if (CONFIG.autoEnterHell) {
                        if (hellBtn ? clickEl(hellBtn) : (hasGame('enterHell') && callGame('enterHell').ok)) {
                            hellDetected = true;
                            hellEnteredAt = gameMs();
                            dayClearedThisRun = true;
                            setStatus('AFTER-HOURS · HELL entered, same run continues');
                        }
                        return true;   // clicked or waiting — NEVER fall through to CLOCK OUT
                    }
                    const decline = finBtns.find(b => b !== hellBtn);
                    if (decline) { clickEl(decline); return true; }
                    if (hasGame('finaleContinue')) { callGame('finaleContinue'); return true; }
                    return true;
                }
                // Chase prompt / dialogue: press its continue button.
                clickEl(finBtns[0]);
                setStatus('finale: pressed "' + (finBtns[0].textContent || '').trim().slice(0, 18) + '"');
                return true;
            }
            if (fmsgOpen && hasGame('finaleGo')) { callGame('finaleGo'); return true; }
            // Same prompt rendered without the class: click the action button.
            if (findByText(/joe\s*shows?\s*up/i) &&
                (clickText(/start\s*running/i) || clickText(/^(start|run|go)\b/i))) {
                setStatus('JOE chase — START RUNNING pressed');
                return true;
            }

            if (readPool() && document.querySelector('#levelCards, .levelup, #upCards')) return handleLevelUp();
            return false;
        }

        const h = STATE_HANDLERS[st];
        let acted = false;
        if (h) { try { acted = !!h(); } catch (e) { log('handler error', st, e && e.message); } }
        if (!running) return true;

        // Stuck-breaker: state hasn't moved for a while and we're not playing.
        if (!acted && now - lastStateAt > 2200) {
            stuckTries++;
            lastStateAt = now;
            log('stuck in state', st, '— generic click attempt', stuckTries);
            // v6.88.0 AUDIT S2: `ok`, `yes` and `confirm` were unanchored, which
            // is the vocabulary of a name-SUBMIT button (and `ok` matches inside
            // LOGBOOK). The stated invariant is that the logbook is never
            // touched by the bot; enforce it on this branch too, not only on the
            // last-resort one below.
            const generic = /^(start|play|skip|continue|next|ok|confirm|got it|cheers|yes|retry|again|make it|enter|go|resume|close)\b|after\s*hours/i;
            if (!clickTextIf(generic, notNameForm)) {
                // v6.88.1 L4: cardElements()'s selectors are loose ('.cards > *',
                // '.choice'), so on a screen that is not a level-up they can
                // resolve to the HUD. Vetoed here too — a "card" named PAUSE is
                // not a card.
                const els = cardElements().filter(el => !CHROME_CTRL.test(String(el.textContent || '').trim()));
                if (els.length) clickEl(els[Math.min(stuckTries - 1, els.length - 1)]);
                else {
                    // never blind-click SAVE — the logbook must stay untouched.
                    // v6.88.1 L4: nor the game's CHROME. The blind click walks
                    // `stuckTries` along every visible button on the page, and
                    // the persistent HUD controls (⚙ settings, 📖 recipe book,
                    // ⏸ pause, 🔇 mute, and the book's own tab strip) are always
                    // among them. Clicking those opens modals that put MORE
                    // buttons on the page, so the breaker feeds itself: an
                    // observed run spent 24 s cycling settings → book → STAFF →
                    // ITEMS → CLOSE while a LEVEL UP sat unanswered behind them.
                    // None of these controls has ever advanced a stuck state.
                    const any = [...document.querySelectorAll('button, [role="button"], .btn')]
                        .filter(el => {
                            if (!visible(el)) return false;
                            const t = String(el.textContent || '').trim();
                            // an unlabelled icon button is chrome more often than not
                            if (!t || t.length <= 2) return false;
                            return !CHROME_CTRL.test(t);
                        });
                    if (any.length) clickEl(any[Math.min(stuckTries - 1, any.length - 1)]);
                    else log('stuck-breaker: nothing safe to click (all chrome)');
                }
            }
            acted = true;
        }
        return acted;
    }

    // Used only if `state` cannot be read at all.
    function domFallbackScreens() {
        if (readPool() || cardElements().length >= 2) return handleLevelUp() || clickCardByIndex(0);
        const seq = [/start\s*running/i, /^skip/i, /cheers/i, /got it/i, /make it/i, /resume/i, /^(start|play)/i, /^(pat|joe|minguk)$/i, /enter\s*hell|after[\s-]*hours/i, /retry|again/i];
        for (const re of seq) {
            const el = findByText(re);
            if (el) return clickEl(el);
        }
        return false;
    }


    // =================================================================
    // MOVEMENT — direction sampling on the real field
    // =================================================================
    function enemyProfile(e) {
        const t = String((e && (e.type || e.kind)) || '').toLowerCase();
        return ENEMY_PROFILE[t] || ENEMY_PROFILE._default;
    }

    // v6.107.0 — THE LEARNED PER-TYPE THREAT MULTIPLIER, RE-APPLIED.
    // Withdrawn in 6.85.23 after the worst regression of the project. Three
    // things had to change before it could come back, and all three have:
    //   1. ATTRIBUTION. Only sole-candidate contact events now feed it (see
    //      05-movement's damage classifier). Nearest-type guessing is what
    //      ratcheted every common mob to the cap.
    //   2. TARGET. 1+3*share -> 1+1.2*share at the write site, so the 2.2
    //      store clamp is an asymptote rather than the resting state.
    //   3. AUTHORITY. The APPLIED band is 0.8-1.4, far tighter than the 0.6-2.2
    //      the store may hold, and nothing applies below `enemyMulMinN` sole
    //      events for that type. The failure mode was the bot fearing drunks
    //      at 2.2x and refusing to farm; at 1.4 max that outcome is not
    //      reachable even if the attribution is wrong again.
    // CONFIG.learning.enemyMulApply = false turns it off as one live dial.
    function typeMul(t) {
        try {
            const L = CONFIG.learning || {};
            if (L.enemyMulApply === false) return 1;
            const m = learn && learn.enemyTypeMul && learn.enemyTypeMul[t];
            if (!isFinite(m)) return 1;
            const n = (learn.enemyTypeN && learn.enemyTypeN[t]) || 0;
            if (n < (L.enemyMulMinN != null ? L.enemyMulMinN : 8)) return 1;
            const lo = L.enemyMulFloor != null ? L.enemyMulFloor : 0.8;
            const hi = L.enemyMulCeil != null ? L.enemyMulCeil : 1.4;
            return Math.max(lo, Math.min(hi, m));
        } catch (e) { return 1; }
    }

    function gatherThreats(p) {
        const out = {
            enemies: [], projectiles: [], marks: [], lines: [], near: 0, boss: false,
            passouts: [],
            mix: { swarm: 0, ranged: 0, bomber: 0, boss: 0, total: 0 }
        };
        const R = CONFIG.threat.enemyRange;

        // v6.95.0 farm stance — computed ONCE per gather (not per enemy, and
        // never stale on an empty field).
        {
            const MF = CONFIG.movement;
            const gtF0 = safe(() => gameTime, 0) || 0;
            // v6.96.2 phase audit: the hell latch happens at several sites in
            // 04; recording its GAME TIME lazily here (every gather sees the
            // flag within a tick of the latch) beats editing five latch sites.
            if (hellDetected && hellEnterGt == null) hellEnterGt = gtF0;
            const defNowF = liveDefense();
            const mHpF = p.maxHp || p.maxHealth || 100;
            farmRef.v = MF.farmStance !== false && !hellDetected &&
                gtF0 >= (MF.farmFromS != null ? MF.farmFromS : 90) &&
                gtF0 < (MF.farmUntilS != null ? MF.farmUntilS : 1100) &&
                defNowF != null && defNowF >= (MF.farmDefense != null ? MF.farmDefense : 30) &&
                ((p.hp != null ? p.hp : mHpF) / (mHpF || 1)) >= (MF.farmHp != null ? MF.farmHp : 0.7);
        }

        const es = G.enemies;
        nearestBossRef.v = Infinity;
        if (Array.isArray(es)) {
            for (const e of es) {
                if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') continue;
                if (e.dead === true || (typeof e.hp === 'number' && e.hp <= 0)) continue;
                const t0 = String(e.type || e.kind || '').toLowerCase();
                const bc0 = String(e.bossChar || '');
                // Passed-out customers: NOT a threat — a stationary source of
                // gold and XP. Farmed like loot, excluded from panic/kiting/
                // toughness so they never distort the threat picture.
                if (t0 === 'passout') {
                    // LIVE-AUDIT FIX: a passout mid-FALL lands with radius
                    // r*1.9 and dmg*1.5 (source-verified) — the falling body
                    // is a telegraphed AoE strike, not a farm target yet.
                    if (typeof e.fallT === 'number' && e.fallT > 0) {
                        // v6.85.2: tagged `drop` so the ANCHOR test can ignore
                        // it. It stays a real hazard in the danger field (never
                        // stand under a falling body), but in the day these fire
                        // constantly — every manual-demo `marks:3` window is a
                        // passout landing 1-2s later — and `markHere` was
                        // cancelling the anchor almost permanently because of it.
                        out.marks.push({ x: e.x, y: e.y, r: (typeof e.r === 'number' ? e.r : 14) * 1.9 + CONFIG.threat.markPad, drop: true });
                        continue;
                    }
                    // v6.85.10 (user: "there's too many passouts" / "it needs
                    // to clear ... passouts in day"). This used to cut off at
                    // lootRange*1.3 = 312px. On a 540x540 field that is a
                    // LOCAL window: parked in a corner, the bot could not see
                    // most of the floor, so a backlog on the far side was
                    // invisible and it never travelled to clear it — it just
                    // re-farmed whatever was next to it while the pile grew.
                    // The whole field is gathered now; `far` marks the ones
                    // outside the old window so the planner can treat them as
                    // a travel target rather than a station.
                    {
                        const dpo0 = hyp(e.x - p.x, e.y - p.y);
                        out.passouts.push({
                            x: e.x, y: e.y, r: (typeof e.r === 'number' ? e.r : 12),
                            hp: typeof e.hp === 'number' ? e.hp : 40,
                            maxHp: typeof e.maxHp === 'number' ? e.maxHp : (typeof e.hp === 'number' ? e.hp : 40),
                            id: typeof e.id === 'number' ? e.id : 0,  // lower id = fell first
                            far: dpo0 >= CONFIG.movement.lootRange * 1.3
                        });
                    }
                    continue;
                }
                const dRaw = hyp(e.x - p.x, e.y - p.y);
                // v6.85.12 INSTRUMENT — boss damage ring (user: "the bosses
                // have two blue rings, the inner ring is where the bosses get
                // damaged"). Rather than guess that radius and ship a seventh
                // unmeasured constant, measure it: every time a boss's HP
                // actually drops, record how far away the bot was standing.
                // The upper percentile of those distances IS the outer edge of
                // the ring where our damage lands. Runs BEFORE the enemyRange
                // cut so a boss engaged at the 240px day station is still seen.
                // WeakMap keyed on the entity object — enemies persist frame to
                // frame, and it cannot leak once the game drops them.
                if (t0 === 'boss' && typeof e.hp === 'number' && !/nobook/i.test(bc0 + ' ' + t0)) {
                    if (dRaw < nearestBossRef.v) nearestBossRef.v = dRaw;
                    const prevHp = bossHpMem.get(e);
                    bossHpMem.set(e, e.hp);
                    if (prevHp != null && e.hp < prevHp - 0.5) {
                        bossHitD.push(Math.round(dRaw));
                        if (bossHitD.length > 600) bossHitD.shift();
                    }
                }
                const d = dRaw;
                // v6.85.18 (user: "if a boss goes beyond the boundaries of
                // the canvas, the bot can still attack by going as close to
                // the corners and edges"). The 200px gather cut made an
                // off-canvas boss INVISIBLE: no engagement pull, so the bot
                // wandered instead of hugging the nearest edge point where
                // its weapons still reach the body. DAY-ONLY extension:
                // non-wall bosses are gathered out to 480px, tagged
                // `distant`, and participate ONLY in the firing-ring pull —
                // the ring-error minimisation over edge-clamped candidates
                // naturally parks the bot at the closest reachable point.
                // Distant bosses are excluded from the danger field, the
                // crowd counts and contactImminent, so nothing else changes;
                // hell is excluded entirely (deep-hell giants overlapping
                // the field from off-canvas must keep their old invisibility
                // — engaging them would send the bot corner-chasing).
                // v6.85.19: hell small bosses (r <= 90) join the extension —
                // only the giants keep the exclusion (corner-chasing risk).
                // v6.85.19 (user: "not attacking the inner ring even if time
                // stop is applied"): a FROZEN boss of ANY size also joins.
                // The corner-chasing danger that justifies excluding live
                // giants does not exist while the field is stopped — and the
                // stacking target selection can only pick bosses the gather
                // kept, so a stopped giant beyond 200px (or off-canvas) was
                // invisible at exactly the moment SOUTH SIDE should be
                // stacking on its hit circle.
                const frEarly = safe(() => frame, null);
                const frozenNow = frEarly != null &&
                    ((typeof e.frozenUntil === 'number' && e.frozenUntil > frEarly) ||
                     (typeof p.timeStopUntil === 'number' && p.timeStopUntil > frEarly));
                // v6.91.0 THE OFF-CANVAS GIANT WAS INVISIBLE (user: "when some
                // boss is off-canvas and the damage circle of the boss is also
                // outside of the canvas, the bot needs to hunt it down somehow
                // before it wakes up and does huge one hit damages").
                //
                // The hell branch of this gate keeps a distant boss only when
                // `e.r <= 90` or it is frozen. A GIANT parked beyond the field
                // edge fails both tests, so it was dropped from `out.enemies`
                // outright: no danger cost, no engagement target, no term in the
                // corner or park gates, nothing in the telemetry. The bot could
                // not hunt it because nothing downstream knew it existed.
                //
                // The corner-chasing risk that justifies excluding live giants
                // is a risk about giants ON the field, whose body the planner
                // can orbit into a wall. A boss whose centre is beyond the edge
                // cannot be orbited at all — every candidate step is clamped to
                // the field — so the exclusion buys nothing in that case and
                // costs the entire hunt.
                const fwG = safe(() => W, CONFIG.field.w) || CONFIG.field.w;
                const fhG = safe(() => H, CONFIG.field.h) || CONFIG.field.h;
                const offC = e.x < 0 || e.x > fwG || e.y < 0 || e.y > fhG;
                // Distance from the PLAY RECTANGLE to the centre (0 on-canvas).
                const gapF = hyp(Math.max(0, Math.max(-e.x, e.x - fwG)),
                                        Math.max(0, Math.max(-e.y, e.y - fhG)));
                // DORMANT = not even the body edge reaches the playable area,
                // so nothing this boss owns can touch a player who is clamped
                // to that area. That is exactly the window the user describes:
                // it is harmless NOW and will not be harmless later, which
                // makes it the one boss worth walking to.
                const dormantB = t0 === 'boss' && offC &&
                    gapF > (typeof e.r === 'number' ? e.r : 40) &&
                    !(e.wall === true || /nobook/i.test(bc0 + ' ' + t0));
                // v6.91.1 MEASURED, AND 6.91.0's RANGE WAS FAR TOO SHORT.
                // Live dump at gt 5024 (84 min), player at (7,533): four tier-3
                // bosses at (-1610,253) r613, (100,-1100) r638, (1033,1307) r777,
                // (1299,26) r858 — 1285 to 1641 px from the player. The 900px cap
                // gathered NONE of them, and the telemetry confirmed it:
                // `dormantBoss: false` with four giants on the board.
                //
                // Player distance was also the wrong axis. What matters is
                // whether the BODY can reach the play area, which does not depend
                // on where we happen to be standing — and with radii of 600-860
                // against a 540px field, centre distance says almost nothing.
                const bodyGap = gapF - (typeof e.r === 'number' ? e.r : 0);
                const offReach = CONFIG.deepHell.dormantBodyReach != null
                    ? CONFIG.deepHell.dormantBodyReach : 1200;
                const offRelevant = offC && bodyGap < offReach;
                const distantBoss = d > R && t0 === 'boss' && (offRelevant || d < 480) &&
                    (!hellDetected || offRelevant || (typeof e.r === 'number' && e.r <= 90) || frozenNow) &&
                    !(e.wall === true || /nobook/i.test(bc0 + ' ' + t0));
                if (d > R && !distantBoss) continue;
                const prof = enemyProfile(e);
                const t = t0;
                // NO BOOKING boss = a WALL: impassable, but it does not chase.
                const isWall = e.wall === true || /nobook/i.test(String(e.bossChar || '') + ' ' + String(e.type || ''));
                // LIVE-VERIFIED: real enemies carry NO vx/vy — they have
                // `speed` + `moving` and chase the player directly. The old
                // code read vx||0 = 0, so the planner predicted ZERO motion
                // for every live enemy (and mislabeled every moving boss as
                // stationary). Synthesize the chase vector from speed.
                let vx = e.vx || e.dx || 0, vy = e.vy || e.dy || 0;
                let spd = typeof e.speed === 'number' ? e.speed : 0;
                const fr = safe(() => frame, null);
                // v6.85.15 (user: "the bot is still not registering the two
                // blue rings ... when they are frozen from time stop").
                // SOURCE-VERIFIED: a TIME STOP item does NOT set e.frozenUntil
                // on anyone — the game's enemy loop just does
                // `if (frame < player.timeStopUntil) continue;`. Only WHISKY
                // SOUR sets per-enemy frozenUntil. So every frozen-boss
                // mechanism in this bot (stopBoss, pauseActive, the 6.85.11
                // burn station) keyed on a flag the item never sets, and the
                // stacking window has only ever opened on WS freezes. The
                // global stop now counts as frozen for every enemy, with its
                // remaining frames feeding frozenLeft so the burn/safe
                // two-phase station and the <45-frame drop-out work unchanged.
                const tsLeftE = (fr != null && typeof p.timeStopUntil === 'number' && p.timeStopUntil > fr)
                    ? (p.timeStopUntil - fr) : 0;
                const wsFroz = typeof e.frozenUntil === 'number' && fr != null && e.frozenUntil > fr;
                const frozen = wsFroz || tsLeftE > 0;
                const frozenLeft = Math.max(wsFroz ? (e.frozenUntil - fr) : 0, tsLeftE);
                if (frozen) spd = 0;   // frozen: no chase
                if (!vx && !vy && spd > 0 && e.moving !== false && !isWall && d > 1) {
                    vx = (p.x - e.x) / d * spd;
                    vy = (p.y - e.y) / d * spd;
                }
                const isStationary = t === 'boss' && Math.abs(vx) + Math.abs(vy) < 0.01;
                // FAST CHASER (the four-hour two-top killer): a boss at or
                // above our own speed can NEVER be safely ringed — backing
                // out of its contact radius is impossible once it closes.
                const pSpeed = (typeof p.speed === 'number' && p.speed > 0) ? p.speed : CONFIG.movement.playerSpeed;
                const chaserFast = !isWall && !isStationary && spd >= pSpeed * 0.85;
                // FOUR-HOUR TWO-TOP — SOURCE-VERIFIED: a PAIRED boss. When
                // partners close within GZ_PAIR_DIST they form a freeze field
                // around their MIDPOINT (radius GZ_FREEZE_R): slow 0.6 AND
                // a hard freeze. Handled as a ZONE below, not as chase fear.
                // v6.85.12 (user: "the bot is thinking the freeze aura of the
                // four-hour two-top to be its damage radius"). It was, and the
                // flag was also firing when no field existed: `!!e.partner` is
                // true for the whole run, but the field only forms while the
                // partners are actually close. So a two-top with its partner
                // across the map was carrying a phantom aura, was never
                // engaged, and pushed the bot 130px further out than the boss
                // itself warranted. The flag now means "the field is up (or
                // about to be)" — the same test the midpoint mark uses.
                const pairDist = (t === 'boss' && e.partner && typeof e.partner.x === 'number')
                    ? hyp(e.x - e.partner.x, e.y - e.partner.y) : Infinity;
                const freezeAura = t === 'boss' && pairDist < GZ_PAIR_DIST * 2.2;
                // USER: with OLIVE armor stacked, rushing commons barely
                // scratch — fear of non-boss mobs scales DOWN with armor
                // (up to -36% at OLIVE 6), so the bot stands and grinds.
                const gtDay = safe(() => gameTime, 0) || 0;
                // v6.95.0 — the day x1.15 harden is RETIRED, and its own
                // justification was the bug: it cited "manual run crowd
                // median 0" as the human AVOIDING crowds, but the human's
                // crowd median is 0 because everything nearby DIES. The
                // 6.94.1 bot digest shows what the harden actually bought:
                // crowdMedian 0 the other way — an empty field, no income,
                // two supers at hell entry. THE FARM STANCE inverts it: with
                // armor MEASURED at the farm floor and HP healthy, commons
                // are absorbed, not avoided (armor 35 vs flat 22.4 contact).
                const farmNow = farmRef.v;
                const armorEase = ((t !== 'boss' && !isWall)
                    ? (1 - 0.06 * Math.min(6, armorLevel())) *
                      (farmNow ? (CONFIG.movement.farmContactMul != null ? CONFIG.movement.farmContactMul : 0.45)
                               : ((gtDay < 1200 && !hellDetected) ? 1.15 : 1))
                    : 1);
                out.enemies.push({
                    x: e.x, y: e.y, vx, vy, spd,
                    r: (typeof e.r === 'number' ? e.r : 10) + CONFIG.threat.contactPad,
                    // v6.85.12: the `+130 freezeAura` term is GONE. `reach`
                    // drives a DAMAGE gradient (see the danger loop) and the
                    // boss firing ring. The pair field neither damages nor
                    // emanates from the boss body — it slows and freezes, from
                    // the pair's MIDPOINT — and the `pairFreeze` mark below
                    // already models it correctly, at the right centre, with
                    // the right radius, only while it exists. Adding it here
                    // double-counted the same field as body-centred damage and
                    // shoved the engagement ring 130px out for nothing.
                    reach: (prof.radius + (chaserFast && t === 'boss' ? 50 : 0)) * (slowPadRef.v || 1),   // fast bosses: fear from further out, scaled by how slowed we are
                    // v6.85.23: the 6.85.22 learned multiplier is NO LONGER
                    // APPLIED — it caused the worst regression of the project
                    // (n=273, median 843, supers 0.1, z=-3.1). The attribution
                    // assigned every hit, including mark/proj/DoT hits, to the
                    // NEAREST type, so the most common types ratcheted to the
                    // 2.2 cap within ~10 runs and persisted in the learn
                    // store: the bot feared ordinary mobs at 2.2x and stopped
                    // farming. Attribution keeps recording (instrument only,
                    // pineBot.enemyThreat()); applying it again requires
                    // sole-candidate attribution, not nearest-type.
                    // v6.107.0: that precondition is now MET — see typeMul()
                    // at the top of this file for the three changes and the
                    // 0.8-1.4 applied band that bounds the old failure.
                    w: prof.weight * armorEase * typeMul(t),
                    wall: isWall, boss: t === 'boss', stationary: isStationary, chaserFast, freezeAura,
                    frozen, frozenLeft, distant: distantBoss, t: t0,
                    // v6.85.19: centre beyond the field bounds — most of the
                    // hit circle is unreachable, so any standoff ring must
                    // collapse to the sliver of body that pokes on-canvas.
                    offCanvas: offC,
                    // v6.91.0: `dormant` is the hunt flag; `gapField` is how far
                    // the centre sits outside the play rectangle, which is what
                    // the hunt post is computed from.
                    dormant: dormantB, gapField: gapF,
                    // v6.91.1: the live probe showed every enemy carries a
                    // stable `id` and its own `hp` — which is what lets the hunt
                    // MEASURE whether it is doing anything, instead of assuming.
                    id: e.id != null ? e.id : null,
                    hp: typeof e.hp === 'number' ? e.hp : null,
                    maxHp: typeof e.maxHp === 'number' ? e.maxHp : null
                });
                // A wall next to you is not a swarm closing in — it never
                // counts toward "surrounded" panic.
                // record the first appearance of each enemy class this run —
                // the MEASURED spawn timetable (user: use in-game data, not
                // assumptions) that drives the prep windows below
                const tkey = String(e.bossChar || t0).replace(/_(stand|walk[A-Z]?|icon)$/i, '');
                if (seenTypesThisRun[tkey] == null) {
                    const gtSeen = safe(() => gameTime, null);
                    if (typeof gtSeen === 'number') seenTypesThisRun[tkey] = Math.round(gtSeen);
                }
                if (d < CONFIG.movement.nearbyRadius && !isWall) out.near++;
                if (t === 'boss' && !distantBoss) { out.boss = true; out.mix.boss++; }
                else if (t === 'thrower' || t === 'genz') out.mix.ranged++;   // genz have shootCd — they're shooters (source-verified)
                else if (t === 'bomber') out.mix.bomber++;
                else out.mix.swarm++;
                out.mix.total++;

                // PAIR-FREEZE ZONE: mark the midpoint while the partners are
                // seated (or closing on each other) so the planner routes
                // around it exactly like any telegraphed AoE.
                if (t === 'boss' && e.partner && typeof e.partner.x === 'number') {
                    const pairD = hyp(e.x - e.partner.x, e.y - e.partner.y);
                    if (pairD < GZ_PAIR_DIST * 2.2) {   // seated, or about to sit
                        out.marks.push({
                            x: (e.x + e.partner.x) / 2, y: (e.y + e.partner.y) / 2,
                            r: GZ_FREEZE_R + CONFIG.threat.markPad + (pairD < GZ_PAIR_DIST ? 14 : 0),
                            pairFreeze: true
                        });
                    }
                }

                // SOURCE-VERIFIED TELEGRAPHS, read straight off the entity:
                // a bomber with its fuse lit (fuseUntil) explodes in a blast
                // radius — treat that circle as a telegraphed AoE mark NOW.
                if (t === 'bomber' && e.fuseUntil) {
                    out.marks.push({ x: e.x, y: e.y, r: (e.blast || e.bomb || 60) + CONFIG.threat.markPad });
                }
                // a thrower in its vomit windup (vomitUntil) is about to fire
                // at OUR position — pre-dodge the firing line before the
                // projectile even exists.
                if (t === 'thrower' && e.vomitUntil) {
                    out.lines.push({ x1: e.x, y1: e.y, x2: p.x, y2: p.y, thickness: 30 });
                }
                if (typeof e.hp === 'number' && t !== 'boss') { out.hpSum = (out.hpSum || 0) + e.hp; out.hpN = (out.hpN || 0) + 1; }
            }
        }

        const eps = G.eprojectiles;
        if (Array.isArray(eps)) {
            for (const q of eps) {
                if (!q || typeof q.x !== 'number' || typeof q.y !== 'number') continue;
                if (q.dead === true) continue;
                // FEED FILLER / RANDOM-LANDING ATTACKS (user report + source:
                // falling objects carry land/landR — a landing Y and blast
                // radius): the DROP POINT is the threat, telegraphed like a
                // SOUTH SIDE flame — mark the landing zone and pre-dodge it.
                if (typeof q.land === 'number') {
                    const falling = q.y < q.land - 6;
                    if (falling) {
                        // still in the air: pre-dodge the telegraphed impact
                        out.marks.push({ x: q.x, y: q.land, r: (typeof q.landR === 'number' ? q.landR : 44) + CONFIG.threat.markPad });
                    } else {
                        // LANDED and persisting: a solid contact hazard sitting
                        // on the floor — model it where it actually is.
                        out.marks.push({ x: q.x, y: q.y, r: (typeof q.r === 'number' ? q.r : 16) + CONFIG.threat.markPad, litter: true });
                    }
                    continue;
                }
                if (hyp(q.x - p.x, q.y - p.y) > 340) continue;   // see boss volleys a beat earlier
                out.projectiles.push({
                    x: q.x, y: q.y,
                    vx: q.vx ?? q.dx ?? 0, vy: q.vy ?? q.dy ?? 0,
                    r: (typeof q.r === 'number' ? q.r : 6) + CONFIG.threat.projPad,
                    // source-verified: Smooth Operator's phones carry `home`
                    // (a homing speed) — they curve toward the player, so the
                    // straight-line model would misread them entirely
                    home: (typeof q.home === 'number' && q.home > 0) ? q.home : 0,
                    w: (q.noKill === true ? CONFIG.threat.noKillBonus : 1) * (q.home ? 1.6 : 1)   // homing phones: evadable but relentless — respect them
                });
            }
        }

        const dm = G.dropMarks;
        if (Array.isArray(dm)) {
            const gtM = safe(() => gameTime, null);
            for (const m of dm) {
                if (!m) continue;
                // position may sit on the mark itself, or (older shape) on an
                // `at` OBJECT — accept both, never assume.
                const px = typeof m.x === 'number' ? m.x : (m.at && typeof m.at.x === 'number' ? m.at.x : null);
                const py = typeof m.y === 'number' ? m.y : (m.at && typeof m.at.y === 'number' ? m.at.y : null);
                if (px == null || py == null) continue;
                // passout landing markers ride in this array too: they carry
                // hp/givesTip and no damage. They are loot, not hazards.
                const isHazard = typeof m.dmg === 'number' || typeof m.tele === 'number';
                if (!isHazard) continue;
                // `at` is the gameTime the blast lands -> seconds remaining
                let tLeft = null;
                if (typeof m.at === 'number' && typeof gtM === 'number') tLeft = m.at - gtM;
                out.marks.push({
                    x: px, y: py,
                    r: (typeof m.r === 'number' ? m.r : 40) + CONFIG.threat.markPad,
                    tLeft, dmg: typeof m.dmg === 'number' ? m.dmg : 0,
                    tele: typeof m.tele === 'number' ? m.tele : null
                });
            }
        }

        // Include UNARMED lanes too: armed:false is the TELEGRAPH phase — the
        // exact window to step off the line before the charge fires.
        const rl = G.roadLines;
        if (Array.isArray(rl)) for (const l of rl) if (l) out.lines.push(l);

        // LINEBACKER ID: the boss that owns active charge lanes. It charges
        // along rays — never hold a ring on it; kite and let homing/directed
        // fire do the work (they track it even off-screen).
        try {
            // v6.88.0 AUDIT D4. This built a Set from `l.owner`, but the
            // source-verified roadLine shape (see lineCost below) is
            // {x, y, ang, armed, dmg} — there is no owner field. The Set was
            // therefore always empty, `e.linebacker` was never assigned
            // anywhere in the codebase, and the `if (e.linebacker) continue`
            // guard in the boss-engagement block was dead: the bot parked at
            // its firing ring on a charging Last Call Linebacker, which is the
            // death the rule was written to prevent. The owner cannot be
            // identified from the real shape, so flag on ARMED lanes being
            // present at all — during a charge telegraph, no boss is ringable.
            const armedLanes = (G.roadLines || []).some(l => l && (l.armed || l.armed === undefined));
            if (armedLanes) for (const e of out.enemies) {
                if (e.boss && !e.wall) e.linebacker = true;
            }
        } catch (e) { }

        // Contested-target check: a passout or wall with live enemies around
        // it is a baited trap — farm it later, when the area is clear. (The
        // run data showed contact deaths climbing once farming landed: greed
        // was pulling the bot into crowds.)
        const chasersNear = (x, y, r) => {
            let n = 0;
            for (const e of out.enemies) if (!e.wall && hyp(e.x - x, e.y - y) < r) n++;
            return n;
        };
        // v6.85.10 (user: "there's too many passouts", screenshot at 17:59
        // with ~20 uncleared passouts on the floor and 21 live bodies). The
        // threshold was an ABSOLUTE count, so it is density-blind: at late-day
        // crowding almost every passout has 3 bodies within 85px, every one
        // trips `contested`, and the farm shuts off exactly when the floor is
        // thickest with loot. The 2 -> 3 bump in an earlier version was the
        // same bug being papered over one notch at a time. "Contested" has to
        // mean *busier than the field already is*, so the bar now rises with
        // the live body count: ~3 on an empty floor, ~7 at 21 bodies.
        const fieldBodies = out.enemies.reduce((n, e) => n + (e.wall ? 0 : 1), 0);
        const contestTol = Math.max(3, Math.round(3 + fieldBodies / 6));
        out.contestTol = contestTol;
        for (const po of out.passouts) po.contested = chasersNear(po.x, po.y, 85) >= contestTol;
        poFreeRef.v = out.passouts.reduce((n, po) => n + ((po.contested || po.far) ? 0 : 1), 0);
        for (const e of out.enemies) if (e.wall) e.contested = chasersNear(e.x, e.y, 100) >= contestTol;

        // FINALE CHASE RIVAL (source-verified, live-diagnosed): during the
        // day-end chase, `finale.rival` hunts the player and hits for HALF
        // MAX HP per touch. It lives OUTSIDE the enemies array, so the old
        // planner was blind to it — the biggest single hits in the damage
        // audit (44.5 through armor) all came from this entity. Treat it as
        // a maximum-priority chaser: huge repulsion, wide contact buffer,
        // and NEVER an engagement target.
        const fin = G.finale;
        if (fin && fin.active === true && fin.rival &&
            typeof fin.rival.x === 'number' && typeof fin.rival.y === 'number') {
            const rv = fin.rival;
            const spd = typeof rv.spd === 'number' ? rv.spd : 3;
            const dd = hyp(p.x - rv.x, p.y - rv.y) || 1;
            out.rival = { x: rv.x, y: rv.y, d: dd };
            out.enemies.push({
                x: rv.x, y: rv.y,
                vx: (p.x - rv.x) / dd * spd, vy: (p.y - rv.y) / dd * spd,   // it chases US
                r: 30, reach: 280, w: 5, boss: false, wall: false, stationary: false, rival: true
            });
            out.mix.boss++; out.mix.total++;
        }

        // v6.125.0 THE PLANNER'S CPU BILL — PART 2 OF 4: THE CANDIDATE SCAN
        // RE-FILTERED THE SAME 260 ENEMIES 33 TIMES.
        //
        // planMove evaluates `movement.samples` (32) candidate directions plus
        // a stand-still, and inside that loop there were FIVE separate full
        // passes over `th.enemies`, four of which threw almost every enemy
        // away on their first line:
        //
        //   nearest-live   `if (e.wall || e.dormant) continue`   -> most pass
        //   danger field   `if (e.distant) continue`             -> most pass
        //   wall siege     `if (!e.wall || e.contested) continue`-> ~1 of 260
        //   boss ring      `if (!e.boss || e.wall) continue`     -> ~2 of 260
        //   aura ult       (no filter, but see part 3)
        //
        // The two selective ones were walking 260 objects to find one wall and
        // two bosses, 33 times a tick, ~455 ticks a wall-second in deep hell:
        // ~7.8 MILLION property reads per wall-second to answer a question
        // whose answer changes once per tick. The predicates are partitioned
        // ONCE here instead, byte-for-byte the same tests in the same order,
        // so the scan sees only the enemies its own filter would have kept.
        //
        // These are LIVE REFERENCES into out.enemies, not copies — the same
        // objects, so anything the planner mutates on an enemy is still seen
        // by every other pass, exactly as before.
        const eAll = out.enemies;
        const live = [], field = [], siegeWalls = [], ringBosses = [];
        for (let i = 0; i < eAll.length; i++) {
            const e = eAll[i];
            if (!(e.wall || e.dormant)) live.push(e);
            if (!e.distant) field.push(e);
            if (e.wall && !e.contested) siegeWalls.push(e);
            if (e.boss && !e.wall) ringBosses.push(e);
        }
        out.live = live; out.field = field;
        out.siegeWalls = siegeWalls; out.ringBosses = ringBosses;

        return out;
    }

    // distance from point (px,py) to the segment (x1,y1)->(x2,y2) — used to
    // cost the whole TRAVEL PATH of a candidate step against small contact
    // hazards, so the planner can't cut straight through them to the far side
    function distPointSeg(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const l2 = dx * dx + dy * dy || 1;
        let t = ((px - x1) * dx + (py - y1) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return hyp(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // v6.120.0: the raw perpendicular distance to a charge ray, or null if this
    // lane shape has no readable ray. Separated from lineCost because lineCost
    // returns a PADDED, GRADED cost (good for the danger field, useless for
    // "am I in the part that kills"), and the telegraph test needs the actual
    // geometry against the game's own source-verified hit radius.
    function linePerp(l, x, y) {
        if (!l || typeof l.ang !== 'number' ||
            typeof l.x !== 'number' || typeof l.y !== 'number') return null;
        return Math.abs((y - l.y) * Math.cos(l.ang) - (x - l.x) * Math.sin(l.ang));
    }

    function lineCost(l, x, y) {
        // roadLines are charge lanes. REAL game shape (source-verified via the
        // Last Call Linebacker): {x, y, ang, armed, dmg} — an angled RAY
        // through (x,y); the game's own hit test is perpendicular distance.
        const pad = CONFIG.threat.linePad;
        try {
            if (typeof l.ang === 'number' && typeof l.x === 'number' && typeof l.y === 'number') {
                const perp = Math.abs((y - l.y) * Math.cos(l.ang) - (x - l.x) * Math.sin(l.ang));
                // SOURCE-VERIFIED (live diagnostics, 547-run line-death audit):
                // the game's own hit test is `perp < 63` — the lane kills 63px
                // to EACH side of the ray, not 18. The old model told the bot
                // the outer 35-60px band was safe; it died there in 25 of the
                // last 30 runs. Width = the game's 63 + our pad.
                const width = 63 + pad;
                // GRADED, not binary: the lane can be wider than one planner
                // step, so a flat cost makes every direction look equally
                // doomed. A gradient means stepping outward ALWAYS pays.
                return perp >= width ? 0 : 1 - (perp / width) * 0.85;
            }
            if (typeof l.x === 'number' && typeof l.w === 'number' && typeof l.h === 'number') {
                return (x > l.x - pad && x < l.x + l.w + pad && y > l.y - pad && y < l.y + l.h + pad) ? 1 : 0;
            }
            if (typeof l.x1 === 'number' && typeof l.y1 === 'number') {
                const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
                const len2 = dx * dx + dy * dy || 1;
                let t = ((x - l.x1) * dx + (y - l.y1) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                const px = l.x1 + t * dx, py = l.y1 + t * dy;
                return hyp(x - px, y - py) < (l.thickness || l.w || 26) / 2 + pad ? 1 : 0;
            }
            if (typeof l.y === 'number' && typeof l.x !== 'number') {
                return Math.abs(y - l.y) < (l.thickness || 26) / 2 + pad ? 1 : 0;
            }
            if (typeof l.x === 'number' && typeof l.y !== 'number') {
                return Math.abs(x - l.x) < (l.thickness || 26) / 2 + pad ? 1 : 0;
            }
        } catch (e) { }
        return 0;
    }

    function gatherLoot(p, hpRatio, th) {
        const out = [];
        const ps = G.pickups;
        if (!Array.isArray(ps)) return out;
        let floorCount = 0;
        for (const it of ps) if (it && it.taken !== true && it.dead !== true) floorCount++;
        for (const it of ps) {
            if (!it || typeof it.x !== 'number' || typeof it.y !== 'number') continue;
            if (it.taken === true || it.dead === true) continue;
            if (hyp(it.x - p.x, it.y - p.y) > CONFIG.movement.lootRange) continue;
            const kind = String(it.kind || it.type || '_default').toLowerCase();
            let v = PICKUP_VALUE[kind] ?? PICKUP_VALUE._default;
            let vital = false;
            if (kind === 'health') {
                v = 10 + 70 * (1 - hpRatio);   // near-worthless at full HP, urgent when low
                // v6.95.1: for a character with no regen a heal is the ONLY
                // way lost HP ever comes back — vital fires earlier.
                vital = hpRatio < (charOf().healVital != null ? charOf().healVital : 0.6);
            } else if (kind === 'timestop' || kind === 'firecross' || kind === 'tequila') {
                // Battlefield consumables (timestop freeze, firecross burn,
                // tequila shot) activate ON PICKUP. Grabbing one on an empty
                // field wastes it — value scales with how hot the field is
                // right now (crowd size / losing the DPS race).
                const heat = Math.max(Math.min(1, enemyMix.total / 25), dpsDeficit);
                v = 6 + Math.round(34 * heat);
                // USER-OBSERVED WINNING TACTIC: in hell, chaining time stops
                // and tequila/flame bursts is what outlasts the boss rush
                // when the rainbow gun isn't up yet — these drops become
                // top-priority loot the moment the run crosses into hell.
                // (v6.93.3: the firecross is now carved out below — the
                // chaining doctrine keeps timestop and tequila only.)
                if (hellDetected && kind !== 'firecross') v += (kind === 'timestop' ? 20 : 14);
                // v6.93.3 (user): "flame cross is still being wasted on mobs
                // and bosses. they should be almost exclusively used for
                // passouts." The cross activates ON PICKUP, so the pickup IS
                // the targeting decision. The old ladder (passouts first,
                // then walls/bosses, then lanes, atop a heat-scaled base that
                // alone reached ~54 in hell) meant a cross with no passout
                // anywhere still got grabbed and burned on the crowd. Now:
                // passouts near -> top-priority loot; no passouts -> a flat 4,
                // no heat scaling, no hell bonus, no wall/boss/lane ladder —
                // it lies on the floor until a passout field is up. The
                // source fact makes this cheap: passouts die ONLY to base
                // attacks, splash, the cross, and the ults, while mobs and
                // bosses die to the whole roster — spending the one tool that
                // works on targets everything works on is pure waste.
                if (kind === 'firecross') {
                    // v6.94.2 (user): "early upgrades to ultimate are key but
                    // if they don't come up, then flame crosses are the best
                    // alternative." When the ult is still under lv3 — the
                    // level band where the digest shows piles outgrowing the
                    // cast — a cross on a passout field is worth more.
                    // v6.93.3b: read the passout field from THIS tick's gather,
                    // not lastPlan — the old read lagged a tick in live play
                    // and was simply absent when planMove ran outside the loop.
                    const poUp = th && Array.isArray(th.passouts)
                        ? th.passouts.some(po => !po.far && hyp(po.x - p.x, po.y - p.y) < 190)
                        : !!(lastPlan && (lastPlan.passoutsNear || 0) >= 1);
                    if (poUp) {
                        const gtF = typeof G.gameTime === 'number' ? G.gameTime : 0;
                        const day = gtF < 1200 && !hellDetected;
                        v += day ? 55 : 35;
                        if ((safe(() => player.ultLevel, 0) || 0) < 3) v += 22;   // the stated alternative while the ult lags
                    } else {
                        v = 4;
                    }
                }
            } else if (kind === 'magnet') {
                // Magnet hoovers the floor: worth more the more loot is out.
                v = 8 + Math.min(26, floorCount * 2);
            } else if (kind === 'tip' || kind === 'bottle') {
                // USER-VERIFIED: boss tips carry ROSTER UPGRADES — the
                // highest-leverage loot in the game. Grab them, especially
                // early, where one upgrade compounds for the whole run.
                v = 40 + (gamePhase() === 'early' ? 10 : 0) + Math.round(8 * dpsDeficit);
                // v6.85.16 (user: "pick up tip rewards from killing bosses
                // faster to upgrade faster — even if boss is on the field in
                // day"). A tip drops where a boss died, which is usually next
                // to the OTHER bosses — inside the fear gradient, where lootMul
                // and the danger field starve its pull until the area clears
                // and the run's compounding window is gone. During the day at
                // healthy HP a tip is VITAL-grade: full pull, immune to the
                // greed discounts and the burn-window yield, worth one contact
                // tick exactly like a heal is.
                const gtTip = typeof G.gameTime === 'number' ? G.gameTime : 0;
                if (kind === 'tip' && !hellDetected && gtTip < 1200 && hpRatio > 0.45) vital = true;
                // v6.87.5 SOURCE-READ: openRecipe() spells out the evolution
                // rule — "base attack MAX + cocktail Lv6 + key ingredient MAX
                // -> evolve AT A BOSS TIP". The tip is not merely where the
                // upgrade is offered; it is the TRIGGER. So a tip on the floor
                // with an evolution already qualified is worth more than any
                // other loot in the game: it is a super cocktail lying there.
                if (kind === 'tip' && evolutionPending()) { v += 60; vital = true; }
            } else if (kind === 'coin' || kind === 'bill') {
                // Gold buys weapon upgrades — when we're losing the damage
                // race, gold IS damage. Scale it up with the deficit.
                v += Math.round(8 * dpsDeficit);
            }
            // v6.85.16 FILLER vs PAYOFF (user: "it seems to treat the feed
            // filler mark rewards as the same loot reward as the passouts").
            // Passouts drop bill/tip (source-verified); the ordinary mob feed
            // scatters coins. Per-item the table ranks them correctly, but the
            // loot pull is summed over the floor — a CARPET of filler coins
            // out-pulls the two bills a passout station will produce, and the
            // bot leaves the station to vacuum the feed. While a free passout
            // is up, filler (coins and unknown junk kinds) is halved: it is
            // not deleted — the magnet and the walk between stations still
            // collect it — it just can no longer outbid the payoff loot.
            const filler = kind === 'coin' || !(kind in PICKUP_VALUE);
            if (filler && !vital && poFreeRef.v >= 1) v = Math.round(v * 0.5);
            // And during a flame window the station IS the payoff — a loot
            // detour that breaks the burn costs more than any pickup is
            // worth. Everything non-vital yields while the cross burns.
            const flameNow = typeof p.fireCrossUntil === 'number' &&
                p.fireCrossUntil > (safe(() => gameTime, 0) || 0);   // v6.86.7: seconds, not frames
            if (flameNow && !vital && kind !== 'timestop') v = Math.round(v * 0.45);
            // FLIGHT: a time-stop pickup is the only thing that ends an
            // unkillable chase — it outvalues everything else on the floor.
            if (flightRef.v) {
                if (kind === 'timestop') v = 400;
                else if (kind === 'firecross' || kind === 'tequila') v = Math.round(v * 1.6);
                else if (!vital) v = Math.round(v * 0.3);
            }
            out.push({ x: it.x, y: it.y, v, vital, kind });
        }
        return out;
    }

    // v6.126.0 THE OPTIMIZER CEILING — the biggest performance fact about
    // this script, found by asking V8 directly (`node --trace-opt`):
    //
    //   planMove IS NEVER OPTIMIZED. V8 refuses TurboFan for any function
    //   whose bytecode exceeds --max-optimized-bytecode-size (61,440 bytes;
    //   the same ceiling in Chrome), and planMove is ~3,100 lines. It has
    //   run in the baseline tier — no inlining, no typed-array fast paths,
    //   no register allocation — for as long as it has existed. Lifting the
    //   cap in node took the 219-enemy swarm scene from 2.33 ms to 0.66 ms
    //   per tick (3.5x) with no code change, which is the proof.
    //
    // Chrome's flag cannot be changed from a userscript, so the fix is
    // structural: the hot inner passes move into SMALL top-level functions
    // that V8 will optimize on their own. Each takes everything it reads as
    // parameters or from the module-scope DPOOL, so there is no closure
    // capture of planMove's ~200 locals to defeat the optimizer. The
    // arithmetic is copied verbatim; tools/plan-diff.js holds the 4,320-plan
    // equivalence proof against 6.124.0.
    //
    // The danger field for one candidate (nx, ny), over the flat arrays the
    // builder in planMove filled for this tick. Reads DPOOL directly.
    function dangerAt(nx, ny, px, py, dN) {
        const dFX = DPOOL.fx, dFY = DPOOL.fy, dC2 = DPOOL.c2, dR = DPOOL.r, dKind = DPOOL.kind,
              dCpad = DPOOL.cpad, dReach = DPOOL.reach, dKc = DPOOL.kc, dKp = DPOOL.kp, dKt = DPOOL.kt, dKr = DPOOL.kr;
        let danger = 0;
        for (let k = 0; k < dN; k++) {
            const ddx = nx - dFX[k], ddy = ny - dFY[k], dd2 = ddx * ddx + ddy * ddy;
            if (dd2 > dC2[k]) continue;                       // contributes nothing to this candidate
            const d = Math.sqrt(dd2), r = dR[k], kind = dKind[k];
            if (kind === 1) {
                // Impassable and pins you, but never chases. USER REPORT:
                // the bot was bumping into walls mid-siege — the old cost
                // was a binary cliff at r+8, so the planner parked 1px
                // outside it and jitter shoved it in. Now: a hard
                // no-touch core, a GRADED approach band above it, and a
                // path check so no step cuts across the body.
                if (d < r + 10) danger += 90;
                else if (d < r + 26) danger += 30 * (1 - (d - r - 10) / 16);
                else if (distPointSeg(dFX[k], dFY[k], px, py, nx, ny) < r + 10) danger += 90;
                continue;
            }
            // CONTACT BUFFER (user-verified: ALL bosses deal contact
            // damage): the hitbox itself is maximal cost, and a graded
            // band just outside it — wider for bosses, whose bodies both
            // hit harder and lunge — keeps the bot from grazing.
            // DEEP HELL (v6.82.0): giant bosses lunge further than their
            // sprite — the graded band and the fear radius widen with depth
            // (cpad / reach carry the depth scaling from the builder).
            const cpad = dCpad[k], reachD = dReach[k];
            if (d < r) danger += dKc[k];                                      // contact hurts more late-game; rival = half max HP
            else if (d < r + cpad) danger += dKp[k] * (1 - (d - r) / cpad);
            else if (kind === 2 && distPointSeg(dFX[k], dFY[k], px, py, nx, ny) < r)
                danger += dKt[k];                                             // stepping THROUGH a boss body still hurts
            else if (d < reachD) danger += dKr[k] * ((reachD - d) / reachD); // anchored: commons don't push us off the farm; v6.95.0: armored day = engage the tip carrier, don't orbit it
        }
        return danger;
    }
    // Index of the nearest live body to a candidate (strict minimum, first
    // wins — the original loop's tie rule), or -1 when the list is empty.
    function nearestIdx(nx, ny, n, X, Y, R) {
        let best = Infinity, bi = -1;
        for (let k = 0; k < n; k++) {
            const de = hyp(nx - X[k], ny - Y[k]) - R[k];
            if (de < best) { best = de; bi = k; }
        }
        return bi;
    }

    // v6.126.0 THE CANDIDATE SCAN AS ITS OWN FUNCTION — the second half
    // of THE OPTIMIZER CEILING (see dangerAt). planMove is ~3,100 lines and
    // V8 will not optimize it; this loop was 640 of those lines and most of
    // the per-tick work. As a function of its own it is under the bytecode
    // ceiling and TurboFan compiles it. The body is the loop VERBATIM — the
    // only edits are the destructuring line that gives it planMove's locals
    // and the return of the three it assigns (best, poTtkOut, poDpsOut).
    // Property mutations on shared objects (bossRingRef.v, poTrack) reach
    // planMove exactly as before because they are the same objects.
    function scoreCandidates(C) {
        const {
            DH, M, N, T, anchor, anchorOn, anchorX, anchorY, auraD0, auraE, auraUlt, chBossFloor, chDayRing,
            chPierce, cnrX, cnrY, cornerOn, crOnly, crOnlyW, cx, cy, dN, dayFarm, dayPhaseNow, depth, escape,
            fh, flameOn, flameTarget, flight, fw, grind, gtDeepP, gtNow2, hellMul, hellRecent, hpPanic,
            hpRatio, kite, kiteW, knocker, loot, lootMul, markHere, markW, nearE, nearN, nearR, nearX, nearY,
            p, panic, poCx, poCy, poN, projDt, projHere, projW, rainbowRecent, slowPad, standoffAdj, step,
            stopBoss, stopStation, th, trekPo, ultFall, ultHarvest, wallFocus, wallRanged, zoner
        } = C;
        let best = null, poTtkOut = null, poDpsOut = 0;
        for (let i = 0; i <= N; i++) {
            let dx, dy;
            if (i === N) { dx = 0; dy = 0; }              // the "stand still" candidate
            else { const a = (i / N) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }

            const nx = Math.max(0, Math.min(fw, p.x + dx * step));
            const ny = Math.max(0, Math.min(fh, p.y + dy * step));

            // v6.86.2: distance from THIS candidate to the nearest live body.
            // fireBase() shoots nearestEnemy() measured from the PLAYER, so
            // this is the number the passout station has to beat: standing
            // closer to the passout than to any mob is the only way the base
            // attack ever points at it. (6.86.1 compared the wrong pair — it
            // asked whether the player was nearer the passout than the MOBS
            // were, which is a different and usually unwinnable condition
            // when a mob is chasing us and the passout is parked.)
            // v6.126.0: the pass lives in nearestIdx() — see THE OPTIMIZER
            // CEILING beside dangerAt(). Same strict-minimum, same order.
            let candNearestLive = Infinity, candNearestE = null;
            if (nearN) {
                const ki = nearestIdx(nx, ny, nearN, nearX, nearY, nearR);
                if (ki >= 0) { candNearestE = nearE[ki]; candNearestLive = hyp(nx - nearX[ki], ny - nearY[ki]) - nearR[ki]; }
            }
            // v6.94.0 PIERCE ALIGNMENT (joe). fireBase aims at the NEAREST
            // enemy and joe's barspoon pierces 8 bodies, so whatever stands
            // BEHIND his target is hit too — but only if aligned, which was
            // left to luck. Prefer candidates whose base-attack ray continues
            // into passouts (the one target class base attacks always hurt).
            // The 6.93.0 audit flagged candNearestLive as computed-but-never-
            // read dead code; it is now this term's input.
            let pierceHits = 0;
            if (chPierce >= 4 && candNearestE && th.passouts.length) {
                const bdx = candNearestE.x - nx, bdy = candNearestE.y - ny;
                const bL = hyp(bdx, bdy) || 1;
                const bux = bdx / bL, buy = bdy / bL;
                for (const q of th.passouts) {
                    if (q.far) continue;
                    const qx = q.x - nx, qy = q.y - ny;
                    const proj = qx * bux + qy * buy;
                    if (proj < bL || proj > bL + 300) continue;    // behind the target, within pierce reach
                    if (Math.abs(qx * buy - qy * bux) <= 42 && pierceHits < 3) pierceHits++;
                }
            }

            let danger = 0;

            // v6.88.0 AUDIT D3: a distant boss is gathered ONLY so the
            // firing-ring term can see it. Letting it into the danger field
            // made the planner flee the target it was being paid to close on.
            // v6.125.0: that `if (e.distant) continue` is now th.field.
            // v6.126.0: the danger field is dangerAt() — see THE OPTIMIZER
            // CEILING beside it. Same branches, same thresholds, same numbers.
            danger += dangerAt(nx, ny, p.x, p.y, dN);

            for (const q of th.projectiles) {
                // HOMING projectiles chase the player — predict along the
                // pursuit vector, not the (possibly misleading) current vx/vy.
                let pvx = q.vx, pvy = q.vy;
                if (q.home) {
                    const dd = hyp(p.x - q.x, p.y - q.y) || 1;
                    pvx = (p.x - q.x) / dd * q.home;
                    pvy = (p.y - q.y) / dd * q.home;
                }
                // PERSISTENT FLOATING HAZARDS (source-verified: the feed
                // boss's posts sit at vx=vy=0 with 300+ frames of life and
                // damage on bump): a static projectile is a NO-GO disc, not
                // a passing threat — pad it and route around, graded band.
                if (!q.home && (pvx * pvx + pvy * pvy) < 0.09) {
                    const rr = q.r + T.projPad;
                    const dNowH = hyp(p.x - q.x, p.y - q.y);
                    const dEnd = hyp(nx - q.x, ny - q.y);
                    if (dNowH < rr) {
                        // already overlapping: pure RETREAT gradient — every
                        // px of separation lowers cost, so walking out always
                        // ranks above sliding along or through it
                        danger += projW * q.w * 12 * (1 - Math.min(1, dEnd / (rr + 26)));
                    } else if (dEnd < rr || distPointSeg(q.x, q.y, p.x, p.y, nx, ny) < rr) {
                        danger += projW * q.w * 12;      // don't enter, don't cut through
                    } else if (dEnd < rr + 26) {
                        danger += projW * q.w * 3 * (1 - (dEnd - rr) / 26);
                    }
                    continue;
                }
                // SMOOTH OPERATOR (user report): a homing phone that misses
                // TURNS AROUND — its current heading is never an all-clear.
                // Close range around a live homing projectile is a no-go
                // disc on top of the path prediction, which naturally makes
                // PERPENDICULAR jukes the cheapest escape.
                if (q.home) {
                    const dq = hyp(nx - q.x, ny - q.y);
                    if (dq < q.r + 28) danger += projW * q.w * 6 * (1 - dq / (q.r + 28));
                }
                // sample along the projectile's path, not just its endpoint
                for (let k = 0.25; k <= 1.0001; k += 0.25) {
                    const px = q.x + pvx * projDt * k;
                    const py = q.y + pvy * projDt * k;
                    const d = hyp(nx - px, ny - py);
                    if (d < q.r) { danger += projW * q.w * 14 * (1.1 - k); break; }
                    if (d < q.r * 2.4) danger += projW * q.w * 2 * (1.1 - k);
                }
            }

            for (const m of th.marks) {
                const d = hyp(nx - m.x, ny - m.y);
                // URGENCY: full weight once the fuse is short, tapering for
                // blasts still most of a second away (there is time to route).
                const urg = (typeof m.tLeft === 'number')
                    ? (m.tLeft <= 0.35 ? 1.6 : m.tLeft <= 0.7 ? 1.15 : 0.8)
                    : 1;
                // DEPTH-SCALED (v6.84.0): marks rose to 27% of deaths in the
                // deep-run version. Both the radius we route around and the
                // weight we give it widen with hell depth.
                const mR = m.r * (1 + (DH.markPadMul - 1) * depth);
                const mW = markW * (1 + (DH.markWeightMul - 1) * depth);
                if (d < mR) danger += mW * 16 * urg;
                else if (d < mR * 1.5) danger += mW * 3 * urg;
            }

            // armed lanes are lethal NOW; unarmed ones are telegraphs — still
            // worth pre-dodging before the charge fires, but at their OWN
            // price. v6.111.0: one scalar used to set both, and because the
            // telegraph term is the numerous, expensive, arena-wide one, CEM
            // minimised the pair and dragged the live-charge term to the box
            // floor with it while lanes killed 21% of runs. Two weights, two
            // boxes, two gradients.
            for (const l of th.lines) {
                const armed = l.armed === true;
                const lw = armed ? (T.lineArmedWeight != null ? T.lineArmedWeight : T.lineWeight) : T.lineWeight;
                danger += lineCost(l, nx, ny) * lw * hellMul * (armed ? 14 : 7);
            }

            // Walls pin you when a crowd is pushing: the effective margin
            // widens with nearby pressure so the bot never kites into a corner.
            const mg = CONFIG.field.margin * (1 + 0.8 * Math.min(1, th.near / 6));
            const edge = Math.min(nx, ny, fw - nx, fh - ny);
            if (edge < mg) danger += M.wallWeight * (mg - edge) * 0.9;

            let gain = 0;
            for (const it of loot) {
                const d0 = hyp(p.x - it.x, p.y - it.y);
                const d1 = hyp(nx - it.x, ny - it.y);
                // VITAL pickups (healing while hurt) bypass every greed
                // discount — panic and the hell-entry window suppress loot
                // exactly when a heal is most valuable, which was backwards.
                const pull = it.vital ? M.lootPull * 1.2 : lootMul;
                gain += pull * it.v * (d0 - d1) / Math.max(30, d0);
            }

            // v6.107.0 THE DROP ANCHOR — see the arming block above. Same
            // gradient shape as the loot pull, because it IS a loot pull: the
            // difference is only that this loot has not been dropped yet.
            if (anchorOn) {
                const a0 = hyp(p.x - anchorX, p.y - anchorY);
                const a1 = hyp(nx - anchorX, ny - anchorY);
                gain += M.anchorValue * (a0 - a1) / Math.max(40, a0);
            }

            // Siege the NO BOOKING walls: they never chase, they block the
            // map, and killing them pays gold + XP. Hold a firing ring just
            // outside their contact zone so weapons melt them — the hard
            // don't-touch cost above still keeps us off their hitbox.
            // USER PRIORITY: when a NO BOOKING mob is up, killing it comes
            // FIRST — its siege pull is boosted and every other farm pull
            // (passouts, boss rings) is muted until it's down (wallFocus).
            if (!hpPanic && !hellRecent && !th.rival && !rainbowRecent) {
                // v6.125.0: th.siegeWalls is the `!e.wall || e.contested`
                // filter, done once; `ranged` and every `errNow` are
                // candidate-invariant and are precomputed above the scan.
                for (const e of th.siegeWalls) {
                    const ring = wallRanged ? e.r + 140 : e.r + 38;
                    const errNow = Math.abs(hyp(p.x - e.x, p.y - e.y) - ring);
                    const errNew = Math.abs(hyp(nx - e.x, ny - e.y) - ring);
                    gain += M.wallSiegeValue * (wallFocus ? 2.4 : 1) * dayFarm * (crOnlyW ? 0.4 : 1) * (errNow - errNew) * 0.15;
                }
            }

            // Boss engagement: boss kills pay big loot (user-verified), so at
            // healthy HP hold the edge of the boss's threat radius — weapons
            // keep hitting it — instead of drifting to max distance. Panic,
            // low HP, or the hell-entry surge disengage automatically.
            // USER TACTIC: on the no-rainbow crown path, the win condition is
            // TIME, not boss kills — in hell the bot stalls with time stops
            // and consumable drops instead of seeking boss fights.
            // STALL MODE used to refuse boss engagement outright in hell —
            // "survival time is the score, don't seek boss fights". But with
            // SOUTH SIDE as the damage engine (user), the bot must actually
            // stand where its flame rain LANDS on the boss. Owning the zoner
            // re-enables engagement; without it, the old stand-off holds.
            const stallMode = rainbowChoice === 'skip' && hellDetected && !zoner;
            // The hell-entry window used to suppress engagement for its full
            // 90s — but that is exactly when the first hell bosses arrive.
            // A healthy bot with SOUTH SIDE up may engage through it (user:
            // the burn has to land on the boss); a hurt one still hangs back.
            const entryBlock = hellRecent && !(zoner && hpRatio > 0.7);
            if (!hpPanic && !entryBlock && hpRatio > 0.5 && !th.rival && !rainbowRecent && !stallMode) {
                for (const e of th.ringBosses) {   // v6.125.0: was `!e.boss || e.wall` per candidate
                    if (wallFocus) continue;   // NO BOOKING first (user priority)
                    // a boss FASTER than us cannot be ringed — once it closes,
                    // backing out of contact is physically impossible (the
                    // four-hour two-top death pattern). Kite it instead —
                    // UNLESS the SUPER VODKA CRANBERRY knockback whip is up:
                    // it shoves bosses back off the ring (user-verified).
                    if (e.chaserFast && !knocker && !(rainbowThisRun && !rainbowRecent)) continue;   // gun era (demo-tuned): the rainbow melts chargers before contact
                    if (e.freezeAura && !knocker && !(rainbowThisRun && !rainbowRecent)) continue;   // two-top: NEVER ring inside a freeze aura — snipe it remotely
                    if (e.linebacker) continue;   // a charging linebacker is NEVER ringable — kite + homing kill it
                    // MOJITO SNIPER DEFERRAL — REMOVED in v6.85.8.
                    // The rule was: with MOJITO >= 3 and a free passout, leave
                    // the boss to the sniper and keep the body on the farm.
                    // 6.85.6 made it hell-only, 6.85.7 made it yield to SOUTH
                    // SIDE, and the user then settled it outright: "mojito
                    // doesn't kill the holdouts." The premise was false, so the
                    // conditional variants were patching a rule that should
                    // never have existed. Bosses are engaged on their merits.
                    // the firing ring must sit OUTSIDE the boss's contact
                    // buffer — bosses hurt on touch (user-verified, all of them)
                    // v6.85.2: `bossFloor` is a per-character hard minimum on
                    // the firing ring in hell. Pat's 19-minute hell demo took
                    // damage at bossD 136 -> 93 (100->74) and 98 -> 74
                    // (100->46), and nothing at all above ~150. A small boss
                    // could previously be ringed at e.r+55 (~95px), straight
                    // inside that band. Gun-era point-blank melting is exempt:
                    // the rainbow kills before contact matters.
                    const bossFloor = (hellDetected && !(rainbowThisRun && !rainbowRecent))
                        ? chBossFloor : 0;
                    let ring = (rainbowThisRun && !rainbowRecent)
                        ? Math.max(e.r + 34, Math.round(e.reach * 0.55))   // DEMO-TUNED: gun-era point-blank boss melting (user p25: 60px)
                        : (CONFIG.rainbowPolicyOverride === 'skip'
                            // FULL-RUN CALIBRATION: the DAY phase sits far out
                            // (247 measured) where nothing can reach the bot.
                            // HELL (user): SOUTH SIDE must actually LAND on the
                            // boss — hold just outside its contact band so the
                            // flame rain covers the body, not empty floor.
                            ? (hellDetected
                                // early hell: get inside SOUTH SIDE's reach.
                                // late hell (giant bosses): their body covers
                                // the screen — stand off proportionally again.
                                ? (e.r > 90
                                    ? Math.max(e.r + 70, 200)
                                    : Math.max(e.r + 55, Math.min(e.reach + 10, 150)))
                                : Math.max(e.reach + 60, 240))
                            : Math.max(e.reach + 10, e.r + 40));
                    // ---------------------------------------------------------
                    // v6.107.0 THE RING IS NOW SEARCHABLE.
                    // ---------------------------------------------------------
                    // Until now the CEM could tune how much the bot WANTS to
                    // engage a boss (movement.bossEngageValue, 10-36) but never
                    // WHERE IT STANDS while doing it — the distance was this
                    // hand-written expression and nothing else. Every number in
                    // it was fitted by hand from demo measurements, and the
                    // user's standing note applies with force here: this game is
                    // AI-built, "has several bugs and misclassifications", and
                    // "the truth is what's being observed in the game itself".
                    // A hand-fitted constant is a hypothesis; a searchable
                    // multiplier lets the runs falsify it.
                    //
                    // A MULTIPLIER, not a replacement: the phase structure
                    // (day far out, early hell inside SOUTH SIDE's reach, giant
                    // bosses proportional again, gun-era point-blank) is
                    // measured knowledge and is preserved exactly. The search
                    // only scales it, and the box is deliberately narrow
                    // (0.8-1.25) because this distance is the difference
                    // between landing the burn and eating a one-hit.
                    // BOTH GUARDS STILL WIN: bossFloor is applied AFTER the
                    // multiplier, so a low draw cannot walk inside the
                    // per-character hard minimum, and the off-canvas collapse
                    // below still overrides everything.
                    ring *= (M.bossRingMul != null ? M.bossRingMul : 1);
                    if (bossFloor && ring < bossFloor) ring = bossFloor;
                    // v6.85.19 (user: "the bot is still not able to register
                    // the hit radius that's invisible ... outside the visible
                    // canvas"). 6.85.18 added the PULL toward an off-canvas
                    // boss but left the normal standoff ring (240 day), which
                    // is outside weapon reach of a body that is mostly beyond
                    // the edge — the bot approached, parked, and never hit it.
                    // When the centre is off-canvas the standoff logic is
                    // moot (the body cannot chase onto the field any faster
                    // than it drifts), so the station collapses to just
                    // outside the contact band of whatever sliver of the hit
                    // circle reaches on-canvas. The edge-clamped candidates
                    // then hug the nearest edge/corner point automatically.
                    if (e.offCanvas) ring = Math.min(ring, (e.r || 40) + 34);
                    bossRingRef.v = ring;
                    const errNow = Math.abs(hyp(p.x - e.x, p.y - e.y) - ring);
                    const errNew = Math.abs(hyp(nx - e.x, ny - e.y) - ring);
                    // v6.85.6: day bosses outrank the passout farm (user).
                    // The passout pull is already amplified 1.35x by dayFarm
                    // before 1200s, which made a boss and a passout roughly
                    // equal bids; the boss is worth more because its loot is
                    // what levels the ult that then clears the passouts.
                    const dayBossPush = (!hellDetected && gtNow2 < 1200) ? 1.5 : 1;
                    gain += M.bossEngageValue * dayFarm * dayBossPush * (errNow - errNew) * 0.12;
                }
            }

            // Passout farming: walk INTO weapon range of passed-out customers
            // (they drop gold + XP), but don't wedge into their hitbox. Greed
            // is muted while panicking or during the hell-entry window.
            if (th.passouts.length && !hpPanic && !th.rival && !rainbowRecent) {
                // USER KILL ORDER: the frailest passout (lowest max HP) dies
                // first — fastest loot per second — and among peers, the one
                // that FELL FIRST (lowest id) before it despawns.
                // v6.85.14 FOCUS FIRE (user: "still not clearing the
                // passouts towards the 10 minute mark and it keeps piling up
                // ... delaying the upgrades when entering initial hell mode").
                // The bug: frailHp/firstId were computed for the USER KILL
                // ORDER and then NEVER USED — every free passout applied its
                // own ring gradient simultaneously, so with several on the
                // field the bot steered toward the SUM of the pulls: a
                // compromise point between rings (probe: 3 passouts, heading
                // chosen toward the farthest). It orbited between them,
                // finished none, and the pile grew while their maxHp scaled.
                // Now exactly ONE passout is the station target.
                // v6.85.17: the kill order is LOOT PER SECOND, and loot per
                // second includes the walk. Frailest-first alone is distance-
                // blind — it sent the bot across the map for a marginally
                // weaker target while a near one sat uncleared (sim, 500-tick
                // 10-minute drizzle: 8 kills). Scoring hp + 0.5*distance keeps
                // the frailty logic but charges transit for it (same sim: 13
                // kills, +62%). Fell-first (lowest id) still breaks ties.
                let tgtPo = null, tgtScore = Infinity; let poTtk = null;
                for (const po of th.passouts) {
                    if (po.contested || po.far) continue;
                    if (poGiveUp.has(po.id)) continue;   // v6.86.2: measured unkillable this run
                    const sc = po.maxHp + M.killOrderDist * hyp(po.x - p.x, po.y - p.y);
                    if (sc < tgtScore || (sc === tgtScore && tgtPo && po.id < tgtPo.id)) { tgtScore = sc; tgtPo = po; }
                }
                // v6.86.2 FEASIBILITY. Watch the HP actually coming off the
                // station target while we are in range of it. If the damage
                // going in projects a kill time past the budget — or no
                // damage lands at all — the body is scenery for the rest of
                // the run: it deals no contact damage, and the seconds are
                // worth more spent levelling. Only in-range time counts, so
                // the walk over never condemns a passout.
                if (tgtPo) {
                    // v6.100.0 SPEED INVARIANCE: the TTK probe measures dps
                    // in GAME seconds (it was wall seconds — under the frame
                    // multiplier that inflated dps 100x and made every budget
                    // comparison meaningless). gt going backwards = new run:
                    // re-init the track.
                    const nowPo = typeof G.gameTime === 'number' ? G.gameTime : 0;
                    if (poTrack.id !== tgtPo.id || nowPo < poTrack.at) {
                        poTrack = { id: tgtPo.id, hp: tgtPo.hp, at: nowPo, inRangeS: 0, dps: 0 };
                    } else {
                        const dt = nowPo - poTrack.at;
                        if (dt >= 0.4) {
                            const inRange = (hyp(tgtPo.x - p.x, tgtPo.y - p.y) - tgtPo.r) < M.poEngageRange;
                            if (inRange) poTrack.inRangeS += dt;
                            const drop = poTrack.hp - tgtPo.hp;
                            if (drop > 0) {
                                const inst = drop / dt;
                                poTrack.dps = poTrack.dps > 0 ? poTrack.dps * 0.7 + inst * 0.3 : inst;
                            }
                            poTrack.hp = tgtPo.hp;
                            poTrack.at = nowPo;   // game seconds (v6.100.0)
                        }
                    }
                    // The probe measures BASE-ATTACK dps, and the base attack
                    // is not the tool that clears a grown passout — the ult
                    // and the flame cross are. While either is up (or nearly
                    // up), a slow burn is not evidence of hopelessness.
                    const ultAt = safe(() => player.ultReadyAt, Infinity);
                    const ultUpSoon = flameOn || (typeof ultAt === 'number' && (gtDeepP + 12) >= ultAt);
                    const budget = hellDetected ? M.poTtkBudgetHellS : M.poTtkBudgetS;
                    poTtk = poTrack.dps > 0 ? tgtPo.hp / poTrack.dps : Infinity;
                    poTtkOut = poTtk; poDpsOut = poTrack.dps;
                    // v6.99.1 (user): "kill the passouts as soon as they
                    // arrive and constantly try to attack them as 1 out of 3
                    // of them have a tip." In DAY the ult cycles every pile
                    // eventually (fund rush walks it there), so a slow
                    // base-attack burn is never evidence of hopelessness and
                    // an abandoned body is an abandoned tip roll. Give-up is
                    // a HELL doctrine now.
                    // ── v6.118.0 THE WAIVER NEVER EXPIRES AT ULT 6 ───────────
                    // The manual digest of a live minute-76 run, 19 seconds:
                    //   59 ult casts at ultLv 6, poD 59-63 (on station),
                    //   poHp 225,622,870 -> 225,500,181
                    // That is 122,689 HP off 225.6 MILLION — 0.05% — while the
                    // bot stood on it casting three ults a second. Projected
                    // kill time ~23,900 s against a hell budget of 18.
                    //
                    // Give-up could not fire, because `ultUpSoon` asks whether
                    // the ult is within 12 s of ready, and at ult 6 with
                    // cdMul 0.667 it always is. A waiver written for the day —
                    // where the ult cycles round eventually and a slow base
                    // burn proves nothing — became permanent at max ult, and
                    // the one gate that could have released the bot was dead
                    // for the whole run.
                    //
                    // So the waiver is bounded by the probe itself: past
                    // poProbeHardS in-range seconds we have watched many ult
                    // cycles land on this body, and the measurement stands
                    // whatever the cooldown says. The ult being READY is not
                    // evidence; the ult having FIRED and the body not dying is.
                    const probeHard = M.poProbeHardS != null ? M.poProbeHardS : 30;
                    const waived = ultUpSoon && poTrack.inRangeS < probeHard;
                    if (!dayPhaseNow && poTrack.inRangeS >= M.poProbeS && poTtk > budget && !waived) {
                        poGiveUp.add(tgtPo.id);
                        log('passout', tgtPo.id, 'abandoned — ' +
                            (poTrack.dps > 0 ? Math.round(poTtk) + 's to kill at ' + Math.round(poTrack.dps) + ' dps'
                                             : 'no damage landing') +
                            ' (budget ' + budget + 's, hp ' + Math.round(tgtPo.hp) + ')');
                        tgtPo = null;
                    }
                }
                // Corpse Reviver zombies CANNOT hit passouts (user-verified):
                // with CR as the only cocktail, farming them is slow
                // base-attack work — cut the detour incentive.
                for (const po of th.passouts) {
                    if (po.contested) continue;   // surrounded by live enemies: not worth the dive
                    // v6.85.10: a far passout is a TRAVEL target, not a
                    // station. Twenty of them scattered across the field each
                    // applying a full ring gradient sums to mush and the bot
                    // stands still; the single-target trek below handles them.
                    if (po.far) continue;
                    if (wallFocus) continue;      // NO BOOKING first (user priority)
                    // SOURCE-VERIFIED: the game's contact-damage loop has NO
                    // passout exemption — touching a passout hurts exactly
                    // like touching a live enemy (invuln 38 frames between
                    // ticks). Farm from a FIRING RING outside the hitbox —
                    // weapons still hit it — never from on top of it.
                    // live audit: fallen passouts are BIG (r*1.9 in source —
                    // observed r 37) and hit 1.5x — the zone must clear the
                    // real contact edge (r + player radius) with margin
                    // FULL-RUN CALIBRATION (34-min manual MINGUK run): the
                    // farming distance TIGHTENS as the build matures — ~126px
                    // early, 95 mid, 86 late day — then widens post-finale
                    // (~137) where density explodes. Ring follows that curve.
                    const phR = gamePhase();
                    const gtRing = typeof G.gameTime === 'number' ? G.gameTime : 0;
                    // HELL RAMP (demo-measured): 128px at entry widening to
                    // ~245 by minute 30 as everything scales. Day keeps the
                    // tight, build-confidence curve.
                    const hellRing = 115 + Math.min(120, Math.max(0, (gtRing - 1200) / 600 * 120));
                    // v6.85.2: per-character day curve. Pat's manual demo farms
                    // from 130px in the opening minutes then tightens hard to
                    // ~72 and ~62 as the build matures — measured off stationary
                    // poD samples, keyed on gameTime rather than gamePhase()
                    // because the tightening happens at ~180s, well inside the
                    // 'early' bucket. Characters without a dayRing keep the
                    // original minguk-calibrated 118/112/105.
                    const dr = chDayRing;
                    // v6.85.22: the pat curve now reads CONFIG.patRing so the
                    // CEM can search it. CHARS keeps the calibrated defaults.
                    const dayRing = dr
                        ? (gtRing < 180 ? CONFIG.patRing.early : (gtRing < 600 ? CONFIG.patRing.mid : CONFIG.patRing.late))
                        // DAY (minguk-calibrated): hold ~124px — weapons reach,
                        // falls and contact do not. Tight day rings were the
                        // 7-12 minute contact deaths.
                        : (phR === 'early' ? 118 : phR === 'mid' ? 112 : 105);
                    // v6.107.0: the FARMING ring joins the boss ring in the
                    // search box. Same reasoning (see bossRingMul above): the
                    // 115+ramp hell curve and the 118/112/105 day curve are
                    // hand-fitted from demo measurements of an AI-built game,
                    // so they are hypotheses worth letting the runs test.
                    // The multiplier scales the STANDOFF only — `po.r` is the
                    // body's real radius and is added afterwards, so no draw
                    // can ever park the bot inside the hitbox it is farming.
                    const poMul = M.poRingMul != null ? M.poRingMul : 1;
                    let ring = po.r + poMul * ((hellDetected || gtRing > 1200) ? hellRing * slowPad
                        : dayRing * slowPad);
                    const zone = po.r + 18;
                    // v6.85.9 (user): "pat also needs to use flame cross to kill
                    // passouts as other weapons don't do much damage to them."
                    // The flame cross is a BODY-CENTRED burn, not a projectile —
                    // its damage only reaches what the bot is standing next to.
                    // Farming a passout from Pat's 165px day station during the
                    // window spends the whole cross on empty floor. While it is
                    // burning, the station collapses to just outside the contact
                    // zone so the flame actually covers the body. The zone
                    // itself is still off-limits: contact ticks are what the
                    // 55-danger retreat gradient below exists to prevent.
                    // v6.86.7: the station no longer collapses during a burn.
                    // The cross is NOT a body-centred aura — the source fires
                    // three projectiles every 3 frames along the AIM vector at
                    // speed 9-11 ("레인보우건급", rainbow-gun class). It is a
                    // directional flamethrower, so what matters is pointing it
                    // at the target, not standing on it.

                    // v6.86.1 HUG THE STATION TARGET. Two source facts kill
                    // the standoff ring for a FREE passout:
                    //   1. fireBase() shoots `nearestEnemy()` over all
                    //      enemies — so while any live mob is closer than the
                    //      passout, not one base attack lands on it. At the
                    //      105-245px ring that was almost always true.
                    //   2. passouts deal no contact damage (see gatherLoot),
                    //      so there is nothing to stand off FROM.
                    // Pat felt this hardest: 59-frame single shots, no pierce
                    // to leak past the mob it was actually targeting.
                    // A contested passout keeps the old ring — the live
                    // bodies around it are the real reason to stand back.
                    // v6.86.4: the hug is RETRACTED. It was built on the theory
                    // that fireBase()'s nearestEnemy() had to point at the body
                    // — but the body carries 13k HP by minute 4 and 1.8M by
                    // minute 19, so base attacks never kill one either way.
                    // The manual demo stands at 61-94px (median 82 centre,
                    // ~45 from the edge), which is what patRing already said.
                    const hug = false;
                    const dNow = hyp(p.x - po.x, p.y - po.y);
                    const d1 = hyp(nx - po.x, ny - po.y);
                    if (dNow < zone) {
                        // v6.86.4: the cost of being ON the body is BLOCKAGE,
                        // not damage — the game shoves the player out and the
                        // step is wasted, which can pin us against a wall in a
                        // crowd. The magnitude that was tuned as a contact
                        // gradient turns out to be right for the pathing cost,
                        // so it stands; only the reasoning changed.
                        danger += 55 * (1 - Math.min(1, d1 / (zone + 30)));
                    } else {
                        if (po === tgtPo) gain += M.passoutValue * (crOnly ? 0.4 : 1) *
                            (Math.abs(dNow - ring) - Math.abs(d1 - ring)) * 0.15;
                        // never path through an impassable body to reach the far side
                        if (d1 < zone || distPointSeg(po.x, po.y, p.x, p.y, nx, ny) < zone) danger += 60;
                    }
                }
            }

            // standoff: hold a productive distance from the crowd so weapons
            // keep firing (widened automatically when the wave is swarm-heavy)
            if (th.enemies.length && !panic) {
                const errNow = Math.abs(hyp(p.x - cx, p.y - cy) - standoffAdj);
                const errNew = Math.abs(hyp(nx - cx, ny - cy) - standoffAdj);
                // v6.88.2: past the corner-anchor threshold the standoff ring
                // is the thing being overridden — holding a mark-proof corner
                // beats holding a firing distance from a crowd that cannot be
                // outrun anyway (mobs pass the player's speed at ~11 minutes).
                gain += M.standoffPull * (errNow - errNew) * 0.28 * (anchor ? 0.4 : 1) * (cornerOn ? 0.25 : 1);
            }
            // v6.88.2 CORNER ANCHOR pull (see the derivation above).
            if (cornerOn) {
                const cNow = hyp(p.x - cnrX, p.y - cnrY);
                const cNew = hyp(nx - cnrX, ny - cnrY);
                gain += (CONFIG.deepHell.cornerPull || 4.0) * (cNow - cNew) * 0.5;
            }

            // TIME-STOP STACKING — DEMO-CORRECTED (81-min manual stall run:
            // paused-boss distance p10 140 / med 254; the body is NEVER
            // hugged). Hold a SOUTH SIDE firing station ~150px out: the
            // flame rain and CAMPARI shred still land, but the wake-up burst
            // can't reach. Pull toward the station from either side.
            // v6.85.6 (user directive): "use SOUTH SIDE to kill bosses in hell
            // while not staying too close when the bot picked up TIME STOP."
            // The station distance was already right (150px, from the 81-min
            // stall run) and the spring is symmetric, so "not too close" was
            // already handled — an explicit inner danger term was tried and
            // measured to change nothing, because at 60px the spring alone
            // already bids 50+ to step outward. What was wrong is the WEIGHT:
            // 26 is about what an ordinary passout detour bids, so on a busy
            // field the station lost to the farm and the free damage window
            // went unused. 44 makes the paused boss the priority it was
            // described as.
            // FIELD TREK: close on the one chosen distant passout. Plain
            // distance, not a ring — the ring gradient takes over as soon as
            // it comes inside the local window and stops being `far`.
            if (trekPo) {
                const eNowT = hyp(p.x - trekPo.x, p.y - trekPo.y);
                const eNewT = hyp(nx - trekPo.x, ny - trekPo.y);
                gain += 26 * (eNowT - eNewT) * 0.2 * dayFarm;
            }

            if (stopBoss) {
                // v6.85.11: SOUTH SIDE is a GROUND weapon — the same fact that
                // drove 6.85.7 and 6.85.9. Its burn lands where the bot's body
                // is, so a flat 150px station meant the boss was never inside
                // the zones at all and the "stacking" window did nothing. The
                // station is now two-phase: while the freeze has real time left
                // (>2s) stand at burn range so the rain covers the body, and as
                // the clock runs down fall back to the old safe ring so the
                // wake-up burst cannot reach. The <45-frame exclusion above
                // still drops the target entirely before it moves.
                const eNowS = Math.abs(hyp(p.x - stopBoss.x, p.y - stopBoss.y) - stopStation);
                const eNewS = Math.abs(hyp(nx - stopBoss.x, ny - stopBoss.y) - stopStation);
                gain += M.stopBossPull * (eNowS - eNewS) * 0.2;
            }

            // ult centering: with 2+ passouts, drift onto their centroid so
            // the outward spiral catches the whole group
            // v6.85.8: under falloff, ONE passout is worth closing on, and the
            // `anchor` gate (HP > 0.7 plus OLIVE/NEGRONI >= 2) kept the bot off
            // the cluster for the whole early day — exactly the window where
            // the user wants passout loot funding the ult. The gate is now the
            // safety half of `anchor` only: hurt, or a blast/shot overlapping
            // the stand position, still suspends it.
            // v6.86.7: pay for pointing the flamethrower at the target. dx,dy
            // is a unit heading, so this is the cosine of the angle between
            // the stream and the target — the planner turns to face it while
            // still free to keep its distance.
            if (flameOn && flameTarget && !hpPanic) {
                const tl = Math.max(1, flameTarget.d);
                gain += M.flameAimValue * ((dx * (flameTarget.x - p.x) + dy * (flameTarget.y - p.y)) / tl);
            }
            // v6.94.0: joe's pierce-line preference (see the computation above)
            if (pierceHits) gain += (M.pierceAlignValue != null ? M.pierceAlignValue : 7) * pierceHits;

            // v6.86.4 HARVEST WINDOW. The demo's whole passout economy is
            // positional: the human drifts onto the pile as the ult comes off
            // cooldown and detonates from ~78px. So the centroid pull is weak
            // background behaviour until the ult is within ultHarvestLeadS,
            // then it becomes the dominant term.
            const ultAimOk = ultFall ? (poN >= 1 && !hpPanic && !markHere && !projHere) : (anchor && poN >= 2);
            if (ultAimOk) {
                const eNow = hyp(p.x - poCx, p.y - poCy);
                const eNew = hyp(nx - poCx, ny - poCy);
                const w = ultHarvest ? M.ultHarvestPull : (ultFall ? 22 : 14);
                gain += w * (eNow - eNew) * 0.15;
            }

            // kiting sweep + gap escape
            // v6.86.1: while joe's Untouchable is up, the spikes are the whole
            // point — walk INTO the densest body cluster inside their reach
            // instead of kiting it. Invulnerable, so this costs nothing.
            if (auraUlt) {
                // v6.125.0: membership and d0e are fixed for the tick (auraE /
                // auraD0 above); only d1e depends on the candidate.
                for (let k = 0; k < auraE.length; k++) {
                    const e = auraE[k];
                    gain += (auraD0[k] - hyp(nx - e.x, ny - e.y)) * 0.9;
                }
            }
            if (kite && i !== N) gain += (dx * kite.x + dy * kite.y) * kiteW;
            if (escape && i !== N && !farmRef.v) gain += (dx * escape.x + dy * escape.y) * M.escapePull *
                (flight ? (grind ? M.grindKiteMul : 1.8) : 1);
            // v6.95.0: in the farm stance the widest-gap flee is OFF, same
            // reasoning as the kite sweep — with contact discounted to near
            // zero, ANY damped flee still beats standing still on an
            // otherwise-quiet field. An HP drop exits the stance and
            // restores it wholesale.

            // pull toward the middle of the arena — corners are death traps,
            // and a mob rush must bend the path INWARD, never into a corner
            const dcNow = hyp(p.x - fw / 2, p.y - fh / 2);
            const dcNew = hyp(nx - fw / 2, ny - fh / 2);
            gain += (dcNow - dcNew) * (0.06 + 0.07 * Math.min(1, th.near / 8));

            if (i !== N) gain += (dx * lastDir.x + dy * lastDir.y) * 1.4;  // momentum, prevents jitter
            else gain -= (zoner ? 2.4 : 1.0);                              // standing still is rarely right (and wastes burn zones)

            const value = gain - danger;
            if (!best || value > best.value) best = { dx, dy, value, danger, gain, pierceHits };
        }
        return { best, poTtkOut, poDpsOut };
    }

    function planMove() {
        const p = G.player;
        if (!p) { moveSource = 'no player binding'; return null; }
        const { w: fw, h: fh } = fieldSize();
        const M = CONFIG.movement, T = CONFIG.threat;
        let poTtkOut = null, poDpsOut = 0;   // v6.86.2 reporting (set by the station block)

        const maxHp = p.maxHp || p.maxHealth || p.hpMax || 100;
        const rawHp = p.hp != null ? p.hp : (p.health != null ? p.health : maxHp);
        // v6.89.1 THE SHIELD IS PART OF THE POOL, AND THE BOT COULD NOT SEE IT.
        // Live probe at gt 2698: hp 287.976, maxHp 287.976 — EXACTLY full — with
        // shield 125.2 of shieldMax 135 and `shieldFlash` equal to the current
        // frame. It was being hit at that instant and reporting itself
        // untouched. `p.shield` was read NOWHERE in this codebase.
        //
        // Two consequences, both bad, and together they are the best
        // explanation on record for "the run was fine and then it died":
        //   1. Every caution gate below — hpPanic, the anchor's hpRatio > 0.7,
        //      the panic multipliers — ran the boldest posture while a third of
        //      the effective pool was being stripped, then met the real HP bar
        //      already at the cliff edge with no accumulated caution.
        //   2. `hp` is what the damage telemetry samples, so EVERY absorbed hit
        //      was invisible to dangerAccum, to the death-cause verdict, and to
        //      the learned per-type threat multipliers. The bot was not
        //      under-reacting to that damage; it never knew it happened.
        // Folding the shield in fixes both at once — the ratio and the sampler
        // are the same number.
        const shield = (typeof p.shield === 'number' && p.shield > 0) ? p.shield : 0;
        const shieldMax = (typeof p.shieldMax === 'number' && p.shieldMax > 0) ? p.shieldMax : 0;
        const hp = rawHp + shield;
        const hpRatio = Math.max(0, Math.min(1, hp / ((maxHp + shieldMax) || 1)));

        // FLAME CROSS — v6.86.7 UNIT FIX. The bot compared this deadline
        // against `frame`, but the game sets it in SECONDS:
        //     player.fireCrossUntil = gameTime + (5 + fireCrossBonus)
        //     if (player.fireCrossUntil && gameTime < player.fireCrossUntil)
        // Live sample: fireCrossUntil 7968.9, gameTime 8054.4, frame 635073 —
        // so `fireCrossUntil > frame` was ALWAYS false and every flame
        // behaviour in this file has been dead code since it was written.
        // (timeStopUntil and frozenUntil ARE frame-based — checked against the
        // same sample — so those comparisons stay as they are.)
        const frameNow = safe(() => frame, 0) || 0;
        const gtFlame = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const flameOn = typeof p.fireCrossUntil === 'number' && p.fireCrossUntil > gtFlame;

        if (hellDetected) applyHellUnban();   // v6.83.0: fifth-super key opens in hell
        const th = gatherThreats(p);
        const loot = gatherLoot(p, hpRatio, th);

        // UPGRADE/LOOT SYNC (user directive): the build must hit its power
        // marks ON TIME — roughly the first super by ~11 min and six by the
        // rainbow window. BUILD HUNGER measures how starved the build is
        // (long gap since the last level-up, or supers behind the timetable
        // pace) and re-weights the whole loot hunt toward XP, tips, and
        // farm kills until the cadence recovers.
        const gtH = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const cadenceHunger = Math.min(1, Math.max(0, (lastLevelUpAt ? Math.min(45000, stampAge(lastLevelUpAt)) : 0) / 45000));
        const expectedSupers = Math.max(0, Math.min(6, (gtH - 480) / 160));
        const paceHunger = Math.min(1, Math.max(0, (expectedSupers - supersThisRun) / 2));
        const buildHunger = Math.max(cadenceHunger, paceHunger);
        if (buildHunger > 0.25) {
            for (const it of loot) {
                // v6.125.0: the array literal was rebuilt and linearly
                // scanned per loot item per tick. Same seven kinds, hoisted
                // to a module-level Set (see HUNGER_KINDS).
                if (HUNGER_KINDS.has(it.kind))
                    it.v *= 1 + 0.7 * buildHunger;   // XP and upgrade currency first when starving
            }
        }

        // GUARDED LOOT — v6.86.1 CORRECTED. The old rule muted a loot pull to
        // 15% when a passout stood on the path, on the stated premise that
        // "the game's contact-damage loop has NO passout exemption". The live
        // source says the opposite:
        //     if(e.type!=='passout' && !isInvuln() && dist < e.r+player.r)
        //     // 접촉 데미지 (passout=만취 손님은 장애물이라 데미지 없음)
        // A passout is a pure OBSTACLE: it blocks and pushes the player out,
        // and never deals damage. Only the falling drop-mark hurts, and marks
        // are modelled separately. So the path costs a detour, not blood.
        for (const it of loot) {
            if (it.vital) continue;
            for (const po of th.passouts) {
                if (distPointSeg(po.x, po.y, p.x, p.y, it.x, it.y) < po.r + 18) { it.v *= 0.85; break; }
            }
        }

        // Enemy-mix telemetry (rolling, decayed): what we're fighting shapes
        // both movement weights (below) and upgrade choices (scoreCard).
        for (const k in enemyMix) enemyMix[k] *= 0.98;
        for (const k in th.mix) enemyMix[k] += th.mix[k];
        const mixShare = k => enemyMix.total > 4 ? enemyMix[k] / enemyMix.total : 0;
        // Ranged-heavy waves → dodge projectiles harder; bomber-heavy waves →
        // respect telegraphed AoE more; swarm-heavy waves → kite wider.
        // HELL BUFFERS (user + data: hell runs die 50-76s past the finale,
        // to proj/mark/contact, INSIDE the entry surge): every hazard class
        // gets a hell multiplier so the movement posture hardens the moment
        // the run crosses into hell — not just for the 90s entry window.
        const hellMul = hellDetected ? 1.3 : 1;
        const projW = T.projWeight * (1 + Math.min(1, 2 * mixShare('ranged'))) * hellMul;
        // v6.97.0 SHIELDLESS MARK FEAR — see the fragileMarkFearMul config
        // comment (the ~550 s mark rain: four joe deaths in a 17-second
        // band). Gated on the LIVE shield stat against the fragile profile's
        // own markShield floor; a character without the floor is untouched.
        const msNeedFear = charOf().markShield;
        const shieldNowFear = Math.max(0, safe(() => player.shield, 0) || 0);
        const markFearMul = (msNeedFear != null && shieldNowFear < msNeedFear)
            ? (CONFIG.threat.fragileMarkFearMul != null ? CONFIG.threat.fragileMarkFearMul : 1.6) : 1;
        const markW = T.markWeight * (1 + Math.min(1, 3 * mixShare('bomber'))) * hellMul * markFearMul;
        const standoffAdj = M.standoff * (farmRef.v ? (M.farmStandoffMul != null ? M.farmStandoffMul : 0.55) : 1) *
            (1 + 0.3 * Math.min(1, mixShare('swarm'))) * (hellDetected ? 1.15 : 1) *
            (flameOn ? 0.75 : 1);   // flame active: tighten in, keep the crowd burning

        // ---- Enemy scaling: MEASURE the difficulty curve ----------------
        // Kill rate (our real DPS output, kills/sec, rolling):
        const kc = G.killCount, nowMs = gameMs();
        if (typeof kc === 'number') {
            if (lastKillCount != null && nowMs > lastKillAt) {
                const inst = Math.max(0, kc - lastKillCount) / ((nowMs - lastKillAt) / 1000);
                killRate = killRate * 0.95 + inst * 0.05;
            }
            lastKillCount = kc; lastKillAt = nowMs;
        }
        // Spawn pressure and enemy toughness (their HP curve, measured live):
        pressureAvg = pressureAvg * 0.97 + th.near * 0.03;
        passoutAvg = passoutAvg * 0.97 + th.passouts.length * 0.03;
        if (th.hpN) toughnessAvg = toughnessAvg * 0.97 + (th.hpSum / th.hpN / 30) * 0.03;
        // Are we losing the damage race? 0 = cruising, 1 = falling behind.
        dpsDeficit = Math.max(0, Math.min(1,
            0.6 * Math.min(1, pressureAvg / 6) +
            0.4 * Math.min(1, Math.max(0, toughnessAvg - 1)) -
            0.5 * Math.min(1, killRate / 2)));
        // Late-game enemies hit harder: widen caution with elapsed time and
        // measured toughness, and start panicking at higher HP.
        const late = Math.min(1, (typeof G.gameTime === 'number' ? G.gameTime : 0) / 1200);
        // Hell-entry onslaught: enterHell() resets spawn timers and queues a
        // surge + first boss immediately — the data shows runs dying 1–2 min
        // after entry. Maximum caution for the first 90 seconds of hell.
        const hellRecent = hellDetected && !!hellEnteredAt && stampAge(hellEnteredAt) < 90000;
        // DEEP-HELL DEPTH (v6.82.0): 0 before CONFIG.deepHell.startS, 1 at
        // fullS. Drives the contact posture below — nothing else.
        const DH = CONFIG.deepHell;
        const gtDeepP = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const depth = hellDetected ? Math.max(0, Math.min(1, (gtDeepP - DH.startS) / Math.max(1, DH.fullS - DH.startS))) : 0;
        // FRESH-GUN WINDOW (user-verified): for ~2.5 min after taking the
        // Rainbow Gun, DPS has cratered and normal play gets the bot killed
        // on contact — survival posture only until the gun scales up.
        const rainbowRecent = rainbowThisRun && !!rainbowAt && stampAge(rainbowAt) < 150000;
        // Surge awareness: the game's own surge window is readable.
        const su = G.surgeUntil, gt = G.gameTime;
        const surgeActive = typeof su === 'number' && typeof gt === 'number' && su > gt;
        // v6.86.1 ULT INVULNERABILITY WINDOW. Both non-nuke ultimates grant
        // real invulnerability while they run — pat's spiral for its whole
        // (1.4+0.13*lv)*1.3 s, joe's Untouchable for 8+0.8*(lv-1) s — and the
        // game's contact loop is gated on `!isInvuln()`. Nothing can hurt us
        // in that window, so caution is wasted there, and for joe RETREATING
        // wastes the ult outright: the spikes only reach player.r + ~149.
        // v6.89.9 MINGUK IS INVULNERABLE DURING THE CLASE AZUL DROP, and this
        // bot could not see it. Read whole from source:
        //
        //   function isInvuln(){ return player.invuln>0 ||
        //     gameTime < (player.ultUntil||0) ||
        //     gameTime < (player.ultSpiralUntil||0) || !!claseUlt; }
        //
        // The last clause is the one that was missed. `useUltimate` for minguk
        // sets `claseUlt = { t:0, drop:max(60, round(dropSec*60)), ... }` — a
        // bare module-scope object, not a timestamp on `player` — and the
        // contact loop's gate returns true for as long as it EXISTS. dropSec
        // comes from the bomb-drop sound (2.3 s fallback), so the window is
        // ~2.3 s of drop plus the white-flash phase: comparable to pat's 2.834 s
        // and utterly unlike the "no invulnerability at all" this project has
        // assumed for minguk since 6.86.1. The user called it: "minguk's
        // ultimate does have an invincibility frame, the game just doesn't seem
        // to label it correctly."
        //
        // The cost of missing it was not cosmetic. `ultInvuln` feeds three
        // gates directly:
        //     caution  = ... * (ultInvuln ? 0.35 : 1)
        //     hpPanic  = !ultInvuln && hpRatio < ...
        //     flight   = ... && !ultInvuln
        // so for minguk the bot played its most frightened posture — panicking,
        // fleeing, and (before 6.89.8) dashing — through the single safest
        // 2.3 seconds of the entire run, every single time.
        // v6.89.10 INVULNERABILITY IS NOT A LICENCE TO OVER-COMMIT. 6.89.9 gave
        // minguk his real `claseUlt` window and `dayClearRate` promptly fell
        // from ~0.80 (n=65 and n=37 rows) to 0.41 at n=22, with runs ending at
        // 163-475 s. A live probe ruled out the obvious cause — `claseUlt` was
        // null 44 s after a cast, so the flag is not sticking.
        //
        // What is left is the shape of the relaxation. `ultInvuln` switched off
        // `hpPanic` and `flight` outright, and those are the two mechanisms that
        // get the bot OUT of a crowd. Through a 2.3 s window the bot therefore
        // walks in, and when the window closes it is standing in the middle of
        // the field with no escape underway. In the day, before OLIVE reaches
        // the 4 levels that floor contact damage, that is fatal in about four
        // seconds.
        //
        // Note this was never minguk-specific: pat's 2.83 s spiral had exactly
        // the same problem. 6.89.9 did not introduce the behaviour, it extended
        // it to the character actually being run, which is what made it visible.
        //
        // So: any invulnerability still relaxes CAUTION — nothing can hurt us,
        // and playing scared inside the window wastes it. But only a window with
        // room left to disengage may switch off panic and flight. Joe's 12 s
        // qualifies for almost its whole duration; pat's and minguk's ~2.3-2.8 s
        // qualify only at the start, which is exactly when committing is safe.
        const gtInv = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const claseNow = safe(() => claseUlt, null);
        let ultInvulnLeft = 0;
        const uuInv = safe(() => player.ultUntil, 0), usInv = safe(() => player.ultSpiralUntil, 0);
        if (uuInv > gtInv) ultInvulnLeft = Math.max(ultInvulnLeft, uuInv - gtInv);
        if (usInv > gtInv) ultInvulnLeft = Math.max(ultInvulnLeft, usInv - gtInv);
        if (claseNow) {
            // claseUlt carries frames, not a timestamp: { t, drop, flashT }.
            // Past the drop it is in the white-flash phase, whose length we have
            // not read — assume little is left rather than much.
            const dropLeft = (typeof claseNow.drop === 'number' && typeof claseNow.t === 'number')
                ? Math.max(0, (claseNow.drop - claseNow.t) / 60) : 0.3;
            ultInvulnLeft = Math.max(ultInvulnLeft, dropLeft);
        }
        const ultInvuln = ultInvulnLeft > 0 || !!claseNow;
        // v6.109.0: accumulate the uptime the demos said decides the day.
        planTicks++;
        if (ultInvuln) invulnTicks++;
        // v6.111.0 THE COMPARABLE NUMBER. `invulnTicks` counts ULT windows.
        // The demo recorder's `inv` counts the game's own isInvuln(), which
        // ORs in `player.invuln` — the 38-frame post-hit window. Comparing
        // the two produced a 3.9x "ult uptime gap" this session that does not
        // exist: joe's ceiling is 8/80 = 10% at lv1 and 12/80 = 15% at lv6
        // (ULT_CD 80 s x ultCdMul), and the bot's measured 0.103 median sits
        // near it. Accumulate BOTH so the phase rows can be read against a
        // demo without the units quietly changing underneath.
        //
        // Note what the human's 0.326 therefore mostly IS: evidence of being
        // hit and surviving it. That is the armour economy the mitigation
        // model describes (defense 23.3 turns every common contact hit into 1
        // damage), not an ult-chaining trick — and it is the opposite of the
        // flee-everything posture the CEM has converged on.
        if (ultInvuln || (safe(() => player.invuln, 0) || 0) > 0) invulnAllTicks++;
        {
            // Accepted casts, not button presses. `useUltimate` returns early
            // while gameTime < ultReadyAt, so counting calls counts rejections
            // — demo #5's "2174 casts in 3945 s" were ~49 real ones, and that
            // misreading drove a whole retracted doctrine. A cast is the only
            // thing that moves ultReadyAt forward.
            const rA = safe(() => player.ultReadyAt, null);
            if (typeof rA === 'number') {
                if (ultLastReadyAt != null && rA > ultLastReadyAt + 1e-6) ultCasts++;
                ultLastReadyAt = rA;
            }
            // ultCdMul is the term the deep-hell model named as the actual
            // lever on uptime and which nothing has ever reported.
            const cm = safe(() => player.ultCdMul, null);
            if (typeof cm === 'number' && cm > 0) ultCdMulSeen = cm;
        }
        {
            const ulNow = safe(() => player.ultLevel, 0) || 0;
            if (ulNow > ultMaxLv) ultMaxLv = ulNow;
            if (ulNow >= 6 && ultLv6At == null) ultLv6At = typeof G.gameTime === 'number' ? G.gameTime : 0;
        }
        const ultInvulnSafe = ultInvulnLeft >=
            (M.ultInvulnCommitS != null ? M.ultInvulnCommitS : 1.2);
        const auraUlt = ultInvuln && charOf().ultKind === 'aura';
        // v6.86.4: how close the ultimate is — the whole passout economy keys
        // off this (see CONFIG.movement.ultHarvestLeadS).
        const gtUlt = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const ultAtT = safe(() => player.ultReadyAt, null);
        const ultInS = typeof ultAtT === 'number' ? Math.max(0, ultAtT - gtUlt) : 999;
        const ultReadyNow = typeof ultAtT === 'number' ? gtUlt >= ultAtT : false;
        // v6.86.2: armour bought with OLIVE + NEGRONI levels is permission to
        // hold ground. Pat (tank) converts it 1.4x, which is what lets him
        // stand on a passout long enough for the flame cross or the ult to
        // land instead of sliding off the body every time a mob closes.
        const armorLv = armorLevel();   // v6.91.3: player.defense, not the key that reads 1 at the cap
        const armorConf = Math.min(M.armorConfMax,
            armorLv * M.armorConfPer * (charOf().style === 'tank' ? 1.4 : 1));
        const caution = (1 - armorConf * (M.armorCautionShare || 0)) * (ultInvuln ? 0.35 : 1) *
            (1 + 0.4 * late + 0.3 * Math.min(1, Math.max(0, toughnessAvg - 1))) *
            (hellDetected ? M.hellCautionMul : 1) *
            (hellRecent ? 1.35 : 1) *
            (rainbowRecent ? 1.35 : 1) *
            (surgeActive ? 1.25 : 1) *
            (flameOn ? 0.85 : 1);   // v6.86.7: the burn is OFFENCE, not a shield — only a mild boldness

        // death-cause telemetry. LIVE-AUDIT FIX: pure exposure counting
        // misattributed deaths badly (standing NEAR a wide lane logged 'line'
        // every tick while actual damage came from elsewhere — 28/30 'line'
        // verdicts vs ZERO observed lane hits in a 4-minute ground-truth
        // audit). Exposure now counts at 0.25 weight; REAL hp drops are
        // classified against the hazards actually in range and weighted by
        // damage taken, so the death verdict follows the damage.
        for (const k in dangerAccum) dangerAccum[k] *= 0.96;
        // v6.89.1 CONTACT REACH — the hardcoded 6 was the audit's own bug.
        // Both this exposure test and the `cands` predicate below measured to
        // the player's CENTRE and compared against a literal 6, but the player
        // has a radius (live probe: p.r = 7.2) and the game collides
        // centre-to-centre against e.r + p.r. Every genuine contact hit landing
        // in the band between 6 and p.r therefore found NO candidate and was
        // booked as `unattributed` — 16% of all events and 16% of all HP lost
        // across 893 recorded runs, with `near` p25 0 / median 1 / p75 2 and
        // bosses a median 210px away. That profile is ordinary contact damage,
        // not a missing hazard class: the predicate was simply too tight.
        // (An aura system was suspected and ruled out — updateAuras iterates
        // player.weapons and kills enemies. It is the bot's OWN damage.)
        const contactReach = (typeof p.r === 'number' && p.r > 0) ? p.r : 7.2;
        for (const e of th.enemies) if (hyp(e.x - p.x, e.y - p.y) < e.r + contactReach) { dangerAccum.contact += 0.25; break; }
        for (const q of th.projectiles) if (hyp(q.x - p.x, q.y - p.y) < q.r * 2.5) { dangerAccum.proj += 0.25; break; }
        for (const m of th.marks) if (hyp(m.x - p.x, m.y - p.y) < m.r) { dangerAccum.mark += 0.25; break; }
        // ── v6.122.0 PROXIMITY TO AN UNARMED LANE WAS BOOKING A DEATH ──────
        // The other three classes require a REAL overlap — inside the body,
        // inside the mark, inside the shot. This one accepted any non-zero
        // `lineCost`, and lineCost is GRADED across the whole 63+pad planning
        // band and does not look at `armed`. So merely standing near a ray
        // that might never fire fed the accumulator that argmaxes into
        // `lastDeathCause`.
        //
        // 6.120.0 walked straight into it: the telegraph fix made the bot
        // notice and flee unarmed lanes, laneIn went 36 -> 112 per run, and
        // `line` jumped to 31-35% of death verdicts — against 2% of HP lost
        // and 1% as sole cause. Over 2,423 runs there are 1,278 sole lane hits
        // total, 0.53 per run; a third of runs cannot be ending on one.
        //
        // The HP-loss classifier twenty lines below already gets this right by
        // requiring `l.armed === true`, which is why `sole.line` stayed flat
        // while the verdict count doubled. Two classifiers, one hazard,
        // opposite answers — and the wrong one decided the verdict.
        //
        // This is NOT cosmetic: lastDeathCause feeds scoreCard in six places
        // and the CEM's directed-defense nudge, and the CEM had already
        // responded by pushing threat.lineArmedWeight 4.62 -> 8.12.
        for (const l of th.lines) {
            if (l.armed !== true) continue;                       // a telegraph is not a cause of death
            const perp = linePerp(l, p.x, p.y);
            const kill = (T.lineKillPerp != null ? T.lineKillPerp : 63);
            // no readable ray (legacy box/segment shapes): fall back to the
            // old any-cost test rather than losing the class entirely.
            if (perp == null ? lineCost(l, p.x, p.y) : perp < kill) { dangerAccum.line += 0.25; break; }
        }
        if (lastHpSample != null && hp < lastHpSample - 0.5) {
            const loss = lastHpSample - hp;
            // v6.89.11 A MARK IS GONE BY THE TIME ITS DAMAGE IS SEEN.
            //
            // 145 runs of damageAudit showed 161-162 point losses sitting in
            // `sole.contact` — and 161.6 is exactly `maxHp * 0.40`, the `again`
            // drop-mark formula, on a 404 pool. The mark detonates, damage
            // applies, the game removes it from `dropMarks`, and the next plan
            // tick finds nothing there. Every one of those was booked as contact
            // because contact is the chain's default.
            //
            // That inflated `sole.contact` (38%) and deflated `sole.mark` (7%),
            // and is the likeliest explanation for `unattributed` at 24% with a
            // bossD median of 205 and a near median of 1 — a mark landed, and by
            // the time the loss was sampled there was nothing in range at all.
            //
            // Classify against the marks seen on the PREVIOUS tick as well as
            // this one. A mark that existed a tick ago and has vanished is the
            // single most likely author of a large loss.
            const markPool = lastMarkSnap.length ? th.marks.concat(lastMarkSnap) : th.marks;
            let cls = 'contact';
            if (th.rival && th.rival.d < 150) cls = 'rival';
            else if (th.lines.some(l => l.armed === true && lineCost(l, p.x, p.y) > 0.15)) cls = 'line';
            else if (th.projectiles.some(q => hyp(q.x - p.x, q.y - p.y) < q.r + 22)) cls = 'proj';
            else if (markPool.some(m => hyp(m.x - p.x, m.y - p.y) < m.r + 10)) cls = 'mark';
            dangerAccum[cls] = (dangerAccum[cls] || 0) + loss * 0.35;

            // v6.85.13 AUDIT — record the EVIDENCE, never a verdict. Same
            // predicates and thresholds as the chain above, but evaluated
            // independently instead of first-match-wins, so we can see how
            // often a class was the SOLE candidate (ground truth), how often
            // it merely co-occurred, and how often NOTHING was in range —
            // which the chain silently books as 'contact'.
            const nearestGap = (arr, f) => { let b = Infinity; for (const it of arr) { const v = f(it); if (v < b) b = v; } return b; };
            const gContact = nearestGap(th.enemies, e2 => hyp(e2.x - p.x, e2.y - p.y) - e2.r);
            const gProj = nearestGap(th.projectiles, q => hyp(q.x - p.x, q.y - p.y) - q.r);
            const gMark = nearestGap(markPool, m => hyp(m.x - p.x, m.y - p.y) - m.r);
            const gBoss = nearestBossRef.v;   // field-wide, not capped at enemyRange
            const cands = [];
            if (th.rival && th.rival.d < 150) cands.push('rival');
            if (th.lines.some(l => l.armed === true && lineCost(l, p.x, p.y) > 0.15)) cands.push('line');
            if (gProj < 22) cands.push('proj');
            if (gMark < 10) cands.push('mark');
            if (gContact < contactReach) cands.push('contact');   // v6.89.1: was a literal 6 — see contactReach above
            dmgAudit.n++; dmgAudit.hp += loss;
            const bump = (tbl, k) => { const b = tbl[k] || (tbl[k] = { n: 0, hp: 0 }); b.n++; b.hp += loss; };
            if (!cands.length) {
                dmgAudit.none.n++; dmgAudit.none.hp += loss;
                if (isFinite(gBoss)) dmgAudit.none.bossD.push(Math.round(gBoss));
                dmgAudit.none.near.push(th.near);
                if (dmgAudit.none.bossD.length > 800) dmgAudit.none.bossD.shift();
                if (dmgAudit.none.near.length > 800) dmgAudit.none.near.shift();
            } else {
                for (const c of cands) bump(dmgAudit.cls, c);
                if (cands.length === 1) bump(dmgAudit.sole, cands[0]);
            }
            // v6.85.22: nearest gathered enemy type within 140px carries
            // the per-type attribution. TELEMETRY ONLY — see below.
            let nearT = null, nearTD = 140;
            for (const e2 of th.enemies) {
                const dd2 = hyp(e2.x - p.x, e2.y - p.y);
                if (dd2 < nearTD) { nearTD = dd2; nearT = e2.t || (e2.boss ? 'boss' : 'mob'); }
            }
            if (nearT) {
                const bt = dmgAudit.byType || (dmgAudit.byType = {});
                const b2 = bt[nearT] || (bt[nearT] = { n: 0, hp: 0 });
                b2.n++; b2.hp += loss;
            }
            // =========================================================
            // v6.107.0 SOLE-CANDIDATE ATTRIBUTION
            // =========================================================
            // 6.85.23 withdrew the learned per-type threat multiplier after
            // the worst regression of the project (n=273, median 843, supers
            // 0.1, z=-3.1) and left the precondition for ever applying it
            // again IN WRITING at the application site: "applying it again
            // requires sole-candidate attribution, not nearest-type."
            //
            // This is that. `nearT` above books EVERY damage event to
            // whatever body happened to be within 140px — so mark, proj, DoT
            // and line damage all landed on the commonest mob type, which is
            // exactly how the common types ratcheted to the 2.2 cap in ~10
            // runs and the bot ended up fearing drunks at 2.2x and refusing
            // to farm. `nearT` keeps feeding dmgAudit.byType, because as RAW
            // TELEMETRY it was never the problem.
            //
            // The LEARNER now only gets events where contact was the ONLY
            // hazard class in range (`cands.length === 1`), so the damage
            // provably came from touching a body — and it is attributed to
            // the body actually inside contact reach, not the nearest one on
            // screen. Everything ambiguous is dropped rather than guessed.
            // Sample counts ride alongside so the application site can refuse
            // to act on a type it has barely seen.
            if (cands.length === 1 && cands[0] === 'contact') {
                let soleT = null, soleGap = contactReach;
                for (const e2 of th.enemies) {
                    const gap = hyp(e2.x - p.x, e2.y - p.y) - e2.r;
                    if (gap < soleGap) { soleGap = gap; soleT = e2.t || (e2.boss ? 'boss' : 'mob'); }
                }
                if (soleT) {
                    hitTypeRun[soleT] = (hitTypeRun[soleT] || 0) + loss;
                    hitTypeN[soleT] = (hitTypeN[soleT] || 0) + 1;
                }
            }
            dmgAudit.ev.push({
                gt: Math.round(typeof G.gameTime === 'number' ? G.gameTime : 0),
                hell: hellDetected ? 1 : 0, loss: Math.round(loss * 10) / 10,
                c: cands.join('+') || 'none', verdict: cls,
                bossD: isFinite(gBoss) ? Math.round(gBoss) : null, near: th.near
            });
            if (dmgAudit.ev.length > 300) dmgAudit.ev.shift();
        }
        lastHpSample = hp;
        // v6.89.11: remember this tick's marks so the NEXT tick can still blame
        // one that detonated and removed itself. Positions only — the objects
        // belong to the game and may be recycled.
        // v6.91.3: book new marks against the SEAT before the snapshot is
        // overwritten. The seat is recomputed here rather than threaded down
        // from the corner block below — it needs only the player position and
        // the field, and duplicating three lines beats reordering the planner.
        (() => {
            const gtM = safe(() => gameTime, null);
            if (typeof gtM !== 'number' || !th.marks.length) return;
            const fwM = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
            const fhM = (typeof G.H === 'number' && G.H > 0) ? G.H : CONFIG.field.h;
            const ins = (CONFIG.deepHell.cornerInset != null) ? CONFIG.deepHell.cornerInset : 0;
            bookMarks(th.marks, lastMarkSnap, gtM,
                (p.x < fwM / 2) ? ins : fwM - ins,
                (p.y < fhM / 2) ? ins : fhM - ins);
        })();
        lastMarkSnap = th.marks.map(m => ({ x: m.x, y: m.y, r: m.r }));

        // v6.89.7 INCOME AUDIT. Both directions of the pool, integrated against
        // gameTime, bucketed by depth. `hp` here is the POOLED reading (raw HP
        // plus shield, since 6.89.1) because that is what actually absorbs a
        // contact tick — a NEGRONI shield regenerating IS heal income.
        //
        // Two guards matter. A gap over 5s means the tab was throttled or a
        // screen intervened, so the interval is dropped rather than smeared
        // across a bucket. And a single jump over 40% of the pool is not
        // income — it is a level-up maxHp raise or a COFFEE BEANS revive — so
        // those are counted separately instead of inflating the heal rate.
        try {
            const gtInc = typeof G.gameTime === 'number' ? G.gameTime : null;
            if (gtInc != null) {
                const key = Math.floor(gtInc / INC_BUCKET_S) * INC_BUCKET_S;
                const b = incAudit.buckets[key] ||
                    (incAudit.buckets[key] = { dtS: 0, lossHp: 0, gainHp: 0, lossN: 0, gainN: 0, spikeN: 0, spikeHp: 0 });
                const dt = incCursor.t == null ? 0 : gtInc - incCursor.t;
                if (dt > 0 && dt < 5) {
                    b.dtS += dt;
                    if (incCursor.hp != null) {
                        const d = hp - incCursor.hp;
                        const poolMax = (maxHp + shieldMax) || 1;
                        if (d > 0.5) {
                            if (d > poolMax * 0.4) { b.spikeN++; b.spikeHp += d; }
                            else { b.gainHp += d; b.gainN++; }
                        } else if (d < -0.5) { b.lossHp -= d; b.lossN++; }
                    }
                }
                incCursor.t = gtInc; incCursor.hp = hp;
            }
        } catch (e) { }

        // LATE-DAY FIX (user: passouts not cleared 15-20 min): 'panic' used
        // to trigger on CROWD COUNT alone, which is just the normal state of
        // a dense late-day field — it was turning all farming off exactly
        // when the loot matters most. hpPanic = actually hurt; panic (crowd
        // included) still governs movement caution and loot greed.
        // v6.85.0: a tank panics later (more HP to spend), a runner sooner
        // v6.86.1: nothing can damage us mid-ult, so panic (and the flight
        // it drives) is suspended for the window — it would spend joe's eight
        // invulnerable seconds running away from the only thing his spikes
        // can hit.
        // v6.86.12: armour buying a LATER panic is also tank evidence. On a
        // runner it delays the one reflex that keeps him alive, so the
        // softening now follows anchorBias with the rest of the tank posture.
        const panicArmor = charOf().anchorBias > 0 ? (1 - 0.5 * armorConf) : 1;
        const hpPanic = !ultInvulnSafe && hpRatio < M.panicHp * charOf().panicMul * panicArmor * (1 + 0.25 * late);
        // USER: NEGRONI + OLIVE make mob rushes survivable — every 3 combined
        // defense levels raise the crowd threshold by 1, so an armored bot
        // keeps farming bosses/passouts/walls through a rush instead of
        // sprinting for a corner.
        const crowdTol = M.crowdedCount +
            Math.round(armorLevel() / 3) +   // v6.91.3
            ((hellDetected || (typeof G.gameTime === 'number' && G.gameTime > 1200)) ? 4 : 0) +
            // DEEP-HELL CALIBRATION: the manual run's MEDIAN crowd at 200
            // minutes was 44 within 90px (p90 219) at 100% HP — density at
            // depth is the working environment, never an emergency.
            (hellDetected ? Math.round(Math.min(40, Math.max(0, ((typeof G.gameTime === 'number' ? G.gameTime : 0) - 1800) / 120))) : 0);
        // v6.85.2: a tank profile (charOf().crowdPanic === false) ignores crowd
        // COUNT entirely and panics on HP alone. Measured: Pat held station at
        // 100 HP through 50-99 near in the day and 102-156 near in hell, with
        // freeze up, taking zero damage. crowdTol still drives the gap-escape
        // and loot-greed terms below for every profile.
        const crowdPanic = charOf().crowdPanic !== false && th.near >= crowdTol;
        const panic = hpPanic || crowdPanic;
        const lootMul = M.lootPull * (panic ? M.panicLootDiscount : 1) *
            (hellRecent ? 0.3 : 1) *      // hell entry: survival only, greed later
            (surgeActive ? 0.6 : 1) *     // surges: dodge first, loot after
            (th.rival ? 0.25 : 1) *       // rival chase: RUN, loot later
            (rainbowRecent ? 0.4 : 1);    // fresh gun: survive first, loot when it scales

        const slowMul = (typeof p.slowMul === 'number' && p.slowMul > 0 && p.slowMul <= 1) ? p.slowMul : 1;
        // SLOW-SCALED MARGINS (demo: slow exposure jumps 15%->40% at hell
        // entry, and the manual run answers by WIDENING every distance, never
        // by dashing). Halved speed = ~1.5x the reaction distance needed.
        const slowPad = Math.min(1.6, 1 + (1 - slowMul) * 1.2);
        slowPadRef.v = slowPad;
        th_nearRef.v = th.near;
        const speed = ((typeof p.speed === 'number' && p.speed > 0) ? p.speed : M.playerSpeed) * slowMul;   // freeze auras SLOW us — plan with real mobility
        const stepFrames = M.lookaheadMs / 16.67;
        const step = speed * stepFrames;
        const projDt = T.projLookaheadMs / 16.67;

        // Crowd centroid for kiting/standoff: CHASING mobs only. Walls and
        // stationary bosses don't move, so including them would bend the kite
        // circle toward things that never follow.
        // v6.91.0: a DORMANT boss (centre and body entirely off the play
        // rectangle) is not part of the crowd. It is hundreds of px outside the
        // field, so leaving it in would drag the centroid off the map and bend
        // the whole kite circle toward a body nothing can reach.
        // v6.122.0: SEED FROM THE PLAYER, NOT FROM (0,0). The consumer at the
        // standoff term gates on `th.enemies.length`, not on `chasers`, so a
        // field containing ONLY walls / stationary bosses / dormant bosses —
        // an ordinary day state, and exactly the `wallFocus` state this file
        // calls "THE kill target" — left cx,cy at the arena ORIGIN and had the
        // bot hold a 150 px ring around the top-left corner of the map.
        // Reproduced with wallSiegeValue silenced: one NO BOOKING wall at
        // (330,200) with the player at (200,200) steered dx=-0.707 dy=-0.707,
        // straight at (0,0); adding a single live mob restored a real bearing.
        // Seeding from p makes the zero-chaser case a no-op (err 0 either way)
        // instead of a phantom attractor.
        let cx = p.x, cy = p.y, chasers = 0;
        for (const e of th.enemies) {
            if (e.wall || e.dormant || (e.boss && e.stationary)) continue;
            if (chasers === 0) { cx = 0; cy = 0; }
            cx += e.x; cy += e.y; chasers++;
        }
        if (chasers) { cx /= chasers; cy /= chasers; }

        // KITING: with a real crowd on the field, the winning pattern is to
        // sweep TANGENTIALLY around it so the swarm forms a trailing line —
        // holding a static standoff lets a spread crowd envelop you. Keep the
        // tangent that continues the current sweep direction.
        // SOUTH SIDE ZONING (user directive): flame rain leaves burning
        // ground that damages enemies WALKING OVER it — the weapon pays when
        // the chase train is dragged across the lingering zones. Owning it
        // switches kiting to aggressive: engage earlier (2 chasers), sweep
        // harder, and never stand parked on cooled ground.
        const zoner = (ownedLevels['SOUTH SIDE'] || 0) > 0 || [...supersMade].some(n => /SOUTH\s*SIDE/i.test(n));
        // SUPER VODKA CRANBERRY (user directive): its whip KNOCKS BOSSES
        // BACK — with the super made, holding the firing ring is safe even
        // against bosses that outrun us, and kiting near bosses drags them
        // through SOUTH SIDE burn zones for the full combo.
        // KNOCKBACK (user, source of contact-damage relief): the super whip,
        // or EITHER VODKA CRANBERRY / MOSCOW MULE at level 6 — all shove
        // bosses off us, which is what makes a ring holdable at all.
        const knocker = [...supersMade].some(n => /VODKA\s*CRANBERRY|MOSCOW\s*MULE/i.test(n)) ||
            (ownedLevels['VODKA CRANBERRY'] || 0) >= 6 || (ownedLevels['MOSCOW MULE'] || 0) >= 6;
        // v6.89.4 BUILD COMPLETENESS damps the kite in hell (user). Anything
        // owned at any level counts — the point is whether the tools EXIST, not
        // whether they are maxed.
        let kiteBuiltN = 0;
        for (const nm of KITE_DAMP_BUILD) if ((ownedLevels[nm] || 0) > 0) kiteBuiltN++;
        const kiteBuildShare = KITE_DAMP_BUILD.length ? kiteBuiltN / KITE_DAMP_BUILD.length : 0;
        let kite = null;
        // v6.87.0: same bet, same per-character answer. Owning SOUTH SIDE (or
        // a fresh rainbow) still buys one chaser of impatience, because the
        // sweep is what drags the train across the burning ground.
        const kiteAt = Math.max(2, (charOf().kiteChasers || 3) - ((zoner || rainbowRecent) ? 1 : 0));
        // v6.89.5 (user): "in the last runs, kiting has resulted in constant
        // contact damage with the mobs in hell as they keep rushing, unlike day
        // mode."
        //
        // That is not a tuning complaint, it is a statement about when kiting is
        // a valid move at all. A tangential sweep only works if it OPENS A GAP:
        // the arc is longer than the pack's straight-line cut across it, so the
        // moment the pack matches your speed the sweep stops buying separation
        // and simply holds the bot inside contact range for the whole arc. This
        // file already knows when that is — `chaserFast` is set per enemy at
        // gather time as `speed >= playerSpeed * 0.85` — and the comment on the
        // standoff term already records that mobs pass the player's speed at
        // around eleven minutes. So in hell the condition is essentially always
        // true, and the bot has been paying the arc cost for nothing.
        //
        // Damping it (6.89.4) was the right direction but the wrong shape: a
        // weaker version of a move that cannot work is still a move that cannot
        // work. When the pack is not outrunnable the kite is OFF, and the corner
        // plus the burn is what the doctrine puts in its place.
        //
        // Day is untouched: day mobs are slower, the sweep does open a gap, and
        // dragging the conga line through burn zones is how the day phase pays.
        //
        // v6.89.6 corrects the SHAPE of that answer. 6.89.5 made the outrun
        // test a cliff: 1x on one side, 0x on the other. Both sides are wrong.
        // Below the threshold the bot kites at full weight even with a finished
        // build sitting in a corner; above it the bot will not take one step
        // away from a body that is one frame from touching it. The user's own
        // phrasing is not a weight at all, it is a THRESHOLD —
        //
        //   "just enough distance for no contact damage deaths"
        //
        // — so against a pack that cannot be outrun the kite stops being a
        // posture and becomes a spacing controller: silent until something is
        // inside (player radius + kiteBand), then a sidestep, then silent again.
        //
        // v6.89.7 FROZEN BODIES ARE NOT CHASING ANYTHING. The 6.89.5 ratio was
        // `fastChasers / chasers`, and those two counts disagreed about frozen
        // enemies: gather forces `spd = 0` on a frozen body, so it can never be
        // `chaserFast`, but `chasers` counted it anyway. A freeze therefore
        // DEFLATED the ratio and flipped `outrunnable` back to true — the exact
        // opposite of the truth, since the pack resumes at full speed the
        // instant the stop ends. A live console read caught it: `outrunnable:
        // true, kiting: true, kiteDamp: 0` under a time stop at 6000s.
        //
        // Under a FULL pause the damage was masked (kiteDamp is 0, so the gain
        // term vanished anyway). The real cost is a PARTIAL freeze — a stop
        // wearing off, or a WHISKY SOUR catching half the pack — where
        // `pauseActive` is false, kiteDamp is the ordinary build damp, and a
        // genuine sweep fires against a pack that is very much still rushing.
        // It also corrupted the panel's posture flag, which is the one thing
        // the user was asked to watch.
        //
        // Count only bodies that are actually moving, on BOTH sides. An
        // all-frozen field then has nothing to outrun, which reads as "the
        // sweep does not pay" rather than "we are faster than them" — the
        // deadband below still steps away from anything touching us.
        let liveChasers = 0, fastChasers = 0;
        for (const e of th.enemies) {
            if (e.wall || e.dormant || (e.boss && e.stationary)) continue;
            if (e.frozen) continue;
            liveChasers++;
            if (e.chaserFast) fastChasers++;
        }
        const outrunnable = !hellDetected || (liveChasers > 0 && (fastChasers / liveChasers) < 0.5);
        // Nearest centre-to-EDGE gap, the same measure the damage audit uses for
        // `gContact` — so the band is expressed in the units the contact deaths
        // were actually counted in.
        let contactGap = Infinity;
        for (const e of th.enemies) {
            if (e.wall || e.dormant) continue;   // v6.91.0: a body off the play rectangle is not a contact
            const g = hyp(e.x - p.x, e.y - p.y) - e.r;
            if (g < contactGap) contactGap = g;
        }
        const kiteBand = (M.kiteBand != null ? M.kiteBand : 20);
        const inKiteBand = contactGap < contactReach + kiteBand;
        // Spacing mode is exactly "the kite ARMED even though the pack cannot be
        // outrun" — which by construction can only have happened via the band.
        // Set inside the gate, not beside it: a flag that reports the posture
        // the bot is not actually in is a flag that makes its own test toothless
        // (the first draft of kite-deadband proved exactly that).
        let kiteSpacing = false;
        if (chasers >= kiteAt && !panic && (outrunnable || inKiteBand)) {
            const rx = p.x - cx, ry = p.y - cy;
            const rm = hyp(rx, ry) || 1;
            const t1 = { x: -ry / rm, y: rx / rm }, t2 = { x: ry / rm, y: -rx / rm };
            kite = (t1.x * lastDir.x + t1.y * lastDir.y) >= (t2.x * lastDir.x + t2.y * lastDir.y) ? t1 : t2;
            kiteSpacing = !outrunnable;
        }

        // GAP ESCAPE: when surrounded, find the widest angular gap between
        // nearby enemies and drive through it — greedy per-direction danger
        // alone can leave every option looking equally bad.
        let escape = null;
        if (th.near >= crowdTol) {
            const angs = [];
            for (const e of th.enemies) {
                if (hyp(e.x - p.x, e.y - p.y) < 140) angs.push(Math.atan2(e.y - p.y, e.x - p.x));
            }
            if (angs.length >= 2) {
                angs.sort((a, b) => a - b);
                let bestGap = 0, bestMid = null;
                for (let i = 0; i < angs.length; i++) {
                    const a = angs[i];
                    const b = i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2;
                    if (b - a > bestGap) { bestGap = b - a; bestMid = (a + b) / 2; }
                }
                if (bestMid != null) escape = { x: Math.cos(bestMid), y: Math.sin(bestMid) };
            }
        }

        // IMMINENT-IMPACT check (data: projectiles cause ~2/3 of deaths):
        // closest-approach prediction against our CURRENT position, homing-
        // corrected — if anything connects within ~0.3s, the dash fires now.
        // LANE-URGENT check (data: lanes now cause ~72% of deaths): standing
        // ON an armed charge lane means walking out is too slow — dash out.
        // RIVAL-URGENT: the chase rival closing in = a half-max-HP hit
        // incoming — dash away well before contact.
        const rivalUrgent = !!(th.rival && th.rival.d < 160);   // live audit: both 1200s deaths were the chase — bail earlier
        // FREEZE ESCAPE: slowed with a boss closing = walking is no longer an
        // option — the dash is the only exit from the aura.
        // FROZEN = caught in the two-top's pair field (or any hard freeze):
        // walking out is impossible, the dash is the only exit.
        const hardFrozen = p.frozen === true || slowMul <= 0.61;
        const frozenUrgent = hardFrozen ||
            (slowMul < 0.7 && th.enemies.some(e => e.boss && !e.wall && hyp(e.x - p.x, e.y - p.y) < e.r + 55));
        // LATE-HELL SPRINTERS (user): mobs faster than even minguk closing
        // to contact range = dash through/past them, don't try to outwalk.
        const sprinterUrgent = hellDetected &&
            th.enemies.some(e => !e.wall && !e.boss && e.chaserFast && hyp(e.x - p.x, e.y - p.y) < e.r + 80);

        // ── v6.111.0 LANE ESCAPE ────────────────────────────────────────────
        //
        // This loop used to `break` on the first urgent lane, because all it
        // produced was a boolean. The boolean fed `laneUrgent`, which fired
        // the dash — and `tryDash` takes its direction from plan.dx/dy, the
        // argmax of a danger field in which the lane is worth `lineWeight`.
        // With that scalar pinned at its box minimum for hundreds of
        // generations, the field barely saw the lane, so the escape hatch
        // pointed wherever everything else pointed. A dash along a 126 px-wide
        // lane is a dash further into it, at speed.
        //
        // Getting out of a lane is geometry, not preference. `lineCost`'s perp
        // distance is |(y-ly)cos(ang) - (x-lx)sin(ang)|, whose gradient is
        // (-sin(ang), cos(ang)); stepping along that, signed by which side we
        // are on, is the shortest way out and is the same answer whatever the
        // weight happens to be. So the loop now accumulates a VECTOR as well,
        // and it no longer breaks early — with two lanes crossing, leaving one
        // by walking into the other is how the crossing kills you.
        //
        // Only real charge lanes qualify (numeric `ang`). A thrower's windup
        // pushes a synthetic segment that ENDS at the player, so it reports a
        // zero-distance hit every tick (the 6.89.13 regression) and has no
        // perpendicular worth taking.
        let laneUrgent = false, laneEx = 0, laneEy = 0, laneCov = 0;
        const laneArmS = T.laneEscapeArmS != null ? T.laneEscapeArmS : 1.6;
        for (const l of th.lines) {
            const inBand = lineCost(l, p.x, p.y);
            if (inBand <= 0.15) continue;                 // clear of this lane
            let urgent = false;
            if (l.armed === true) urgent = true;          // charge is LIVE: go now
            // ══ v6.120.0 THE TELEGRAPH WINDOW HAS NEVER ONCE OPENED ═════════
            //
            // USER: "I am seeing lane mark deaths from the linebacker kill the
            // bot in early hell when they should be the most easily avoided
            // considering that it is an attack that is predictable to avoid."
            //
            // Correct, and here is why the prediction was never used. The
            // clause that was here read `l.life <= laneArmS * 60`. The
            // source-verified roadLine shape — established in 6.88.0, by the
            // audit that found `l.owner` never existed either — is:
            //     {x, y, ang, armed, dmg}
            // There is no `life`. `l.life` appears exactly ONCE in this entire
            // codebase: in the condition that was on this line. `typeof
            // undefined === 'number'` is false, so the branch was dead from the
            // day it shipped. Same failure as `l.owner`: read a field the real
            // shape does not have, get no error, get a silently dead branch.
            //
            // Which left two live paths, and the comment above the dead one
            // condemns the first: "once it arms, walking out is already too
            // late." That was the ONLY reliable trigger.
            //
            // The second, `inBand > 0.55`, is worse than it looks. inBand is
            // 1 - (perp/width)*0.85 with width = 63 + linePad = 77, so 0.55
            // resolves to perp < 40.8 — while the game's own hit test, also
            // source-verified, kills at perp < 63. The bot therefore stood
            // between 40.8 and 63 px of the ray, INSIDE the lethal band, for
            // the whole telegraph, and only moved once the charge went live.
            //
            // The telegraph is observable without `life`: `armed === false` on
            // a lane that already exists IS the telegraph. So an unarmed lane
            // covering the player inside the real kill width is urgent now —
            // which is what "predictable to avoid" means. The `life` reading is
            // kept as an accepted signal in case a shape ever carries one, but
            // nothing depends on it any more.
            else if (typeof l.life === 'number' && l.life <= laneArmS * 60) urgent = true;
            else if (linePerp(l, p.x, p.y) != null &&
                     linePerp(l, p.x, p.y) < (T.lineKillPerp != null ? T.lineKillPerp : 63)) urgent = true;
            // shapes with no readable ray: fall back to the old depth test
            else if (inBand > 0.55) urgent = true;
            if (!urgent) continue;
            // ── v6.122.0 THE `ang` GUARD WAS ONE LINE TOO LATE ──────────────
            // `laneUrgent` used to be set BEFORE this filter, so a thrower's
            // windup — a synthetic segment {x1:e.x, y1:e.y, x2:p.x, y2:p.y}
            // that TERMINATES AT THE PLAYER (gather, ~line 383) — reported a
            // zero-distance hit every tick, tripped `inBand > 0.55`, and
            // latched laneUrgent with roadLines EMPTY. `plan.laneUrgent` is an
            // OR-term in the dash trigger, so any thrower winding up inside
            // enemyRange fired the dash on every gate interval regardless of
            // danger. That is the 6.89.13 regression exactly; `lineHere` was
            // given this filter at the time and `laneUrgent` was not.
            // Reproduced: a thrower + vomitUntil with roadLines=[] yielded
            // laneUrgent=true, laneIn=0, lineHere=false.
            if (typeof l.ang !== 'number' || typeof l.x !== 'number' || typeof l.y !== 'number') continue;
            laneUrgent = true;
            const s = (p.y - l.y) * Math.cos(l.ang) - (p.x - l.x) * Math.sin(l.ang);
            const sgn = s >= 0 ? 1 : -1;
            // weight by how deep in the band we are: the lane we are centred
            // on gets the loudest vote, which is the one most likely to hit.
            laneEx += sgn * -Math.sin(l.ang) * inBand;
            laneEy += sgn * Math.cos(l.ang) * inBand;
            laneCov++;
        }
        laneInTicks += laneCov > 0 ? 1 : 0;

        let projImminent = false;
        for (const q of th.projectiles) {
            let pvx = q.vx, pvy = q.vy;
            if (q.home) {
                const dd = hyp(p.x - q.x, p.y - q.y) || 1;
                pvx = (p.x - q.x) / dd * q.home;
                pvy = (p.y - q.y) / dd * q.home;
            }
            const sp2 = pvx * pvx + pvy * pvy;
            if (sp2 < 0.25) continue;
            const t = ((p.x - q.x) * pvx + (p.y - q.y) * pvy) / sp2;   // frames to closest approach
            if (t > 0 && t < 18) {
                const cax = q.x + pvx * t, cay = q.y + pvy * t;
                if (hyp(cax - p.x, cay - p.y) < q.r + 6) { projImminent = true; break; }
            }
        }

        // USER PRIORITY: an uncontested NO BOOKING wall on the field is THE
        // kill target — everything else (passouts, boss rings) waits.
        const wallFocus = th.enemies.some(e => e.wall && !e.contested);
        // FARM ANCHOR (user: stop running from mobs when armored + ult in
        // hand): a farmable target in range + real defense = PLANT AND KILL.
        // TELEMETRY REBALANCE (12/30 recent deaths = marks, zero supers,
        // zero hell entries): the anchor was out-bidding telegraphed blasts.
        // It now requires 70%+ HP and SUSPENDS while a mark overlaps the
        // stand position — plant on loot, never inside a falling attack.
        // PAUSE STATE: how much of the nearby field is frozen right now.
        // A live pause makes dashing pointless; no pause in hell means
        // unkillable-scaled bodies are actually moving at us.
        let frozenNear = 0, movingNear = 0;
        for (const e of th.enemies) {
            if (e.wall || e.dormant) continue;   // v6.91.0
            if (hyp(e.x - p.x, e.y - p.y) > 200) continue;
            if (e.frozen) frozenNear++; else movingNear++;
        }
        const pauseActive = frozenNear > 0 && movingNear <= Math.max(1, Math.round(frozenNear * 0.25));
        if (hellDetected) { runHellTicks++; if (pauseActive) runPauseTicks++; }   // v6.91.4
        // v6.89.4 KITE DAMPING (user), computed here because it reads the pause.
        // The day is untouched: the funding phase still wants the pack dragged
        // through burn zones, and a thin early build has nothing else to do.
        //
        //   "make kiting lower in hell mode if bot has [the build]"
        //   "kiting lower especially with time stop ... in hell mode"
        //   "just enough distance for no contact damage deaths — which should be
        //    rare with negroni's dodge and shield"
        //
        // Under a time stop the field is not moving. There is nothing to sweep
        // around and nothing chasing; the kite is pure wasted travel that walks
        // the bot off its own burn. That case is damped hardest.
        const kiteDampBuild = hellDetected
            ? 1 - (1 - (M.kiteDampFull != null ? M.kiteDampFull : 0.25)) * kiteBuildShare
            : 1;
        const kiteDamp = (hellDetected && pauseActive)
            ? kiteDampBuild * (M.kiteDampPaused != null ? M.kiteDampPaused : 0.15)
            : kiteDampBuild;

        // FLIGHT MODE: in hell, with no pause holding the field and the
        // bodies scaled past killable, fighting is not an option — run,
        // dash, and get to a time-stop pickup. Pause ends it.
        // v6.85.6 (user directive): "once mobs become unkillable the bot
        // should constantly dash away and run away while using ultimate."
        // `!hpPanic` switched flight OFF at low HP — exactly when running
        // matters most. The panic posture that replaced it does NOT open the
        // 300 ms dash gate (that keys on plan.flight), so the bot got less
        // mobile the closer it came to dying. The crowd gates are unchanged:
        // loosening them is not something the directive settles, and there is
        // no measurement behind 4-vs-3.
        // v6.88.0 AUDIT D3: `distant` is now READ. It was written onto every
        // gathered enemy and never read anywhere, so the exclusions its own
        // comment promises ("excluded from the danger field, the crowd counts
        // and contactImminent") did not exist. In hell with slowMul 0.5 a
        // distant boss at 210px still contributed danger ~5.4 — above the 4.8
        // dash threshold — so the bot dashed away from the boss the firing-ring
        // term was simultaneously paying it to approach.
        const unkillable = toughnessAvg > 25 || (killRate < 0.8 && th.near >= 6);
        // v6.87.0: the crowd that triggers flight is per character. Fleeing is
        // a speed bet, and pat cannot win it — at 1.9 he is slower than deep
        // hell's spawns from ~60m on, so flight for him is being chased down
        // with his back turned instead of eating the hits his armour and his
        // invulnerable ult window were bought for. He commits at 6; minguk,
        // whose doctrine IS outrunning, keeps the historical 4.
        const fleeNear = charOf().fleeNear || 4;
        const flight = hellDetected && !pauseActive && unkillable && th.near >= fleeNear && !ultInvulnSafe;
        flightRef.v = flight;
        // v6.85.20 (user): "the deep hell poison kill should be from the mobs
        // ... keep dashing away and ultimate until the bot can get timestop
        // from the mob through luck ... frequent killing of mobs with ultimate
        // and southside when boss is not present should help." Two flight
        // postures, not one. With a BOSS hunting us, flee at full pressure
        // (kite 1.8x). BOSSLESS flight is the GRIND: the pack chases through
        // our own SOUTH SIDE wake, the ult fires on cooldown, and mob kills
        // are the only source of the timestop that ends the chase — so the
        // kite pressure eases (1.25x) to keep the pack inside the burn wake
        // instead of outrunning our own kill loop. Audit context: ~18% of all
        // HP loss is an unmodelled DoT the user attributes to these mobs, so
        // pure distance was never buying what the planner thought it was.
        const grind = flight && zoner && !th.enemies.some(e => e.boss && !e.wall);

        // v6.85.2: falling-passout drops excluded — see the `drop` tag above.
        const markHere = th.marks.some(m => !m.drop && hyp(m.x - p.x, m.y - p.y) < m.r + 50);
        // live enemy fire anywhere near us: do NOT plant — keep moving
        const projHere = th.projectiles.some(q =>
            hyp(q.x - p.x, q.y - p.y) < q.r + 130);
        const dayPhaseNow = !hellDetected && (typeof G.gameTime === 'number' ? G.gameTime : 0) < 1200;
        // v6.85.0: a tank plants on a busier field than a runner would
        // v6.85.16 FLAME ANCHOR (user: "the pat bot is not anchoring to
        // fully utilize the flame cross to defeat the passouts"). The normal
        // anchor demands a quiet field (near <= 4 for Pat), OLIVE/NEGRONI >= 2
        // and no shot within 130px — a 10-minute field fails all three almost
        // permanently. Without anchor the kite pull runs at FULL strength and
        // drags the bot off the station, so the 6.85.9 collapsed flame ring
        // was being fought by kiting for the whole burn window: the cross
        // burned while the bot slid away from the passout. While the cross is
        // up with a free passout in reach, the burn IS the defense (`caution`
        // already scales 0.72x under flame) — anchor unconditionally on
        // everything except being hurt, the rival chase, and flight.
        const flameAnchor = flameOn && !hpPanic && !th.rival && !rainbowRecent && !flight &&
            th.passouts.some(po => !po.contested && !po.far && hyp(po.x - p.x, po.y - p.y) < 260);
        // v6.86.2 (user: "he needs to be anchored to keep attacking the
        // holdouts"). A holdout — a passout or wall we are standing on — only
        // dies to sustained fire, and sliding off it every time a mob closes
        // is why they never finished. With armour bought (OLIVE/NEGRONI) the
        // tank has the licence to plant. Hugging distance, not the old
        // 220px "nearby", is what counts here.
        // v6.86.12 (user: "why has minguk regressed so much? it can't pass
        // the day time... or dies very early"). The anchor was derived ENTIRELY
        // from Pat demos — a 180 HP tank with anchorBias 1 and crowdPanic off —
        // but its only gate was armorConf, which is read off OLIVE/NEGRONI
        // levels. Minguk's own doctrine rushes exactly those, so a 120 HP
        // runner with anchorBias 0 and crowdPanic ON inherited a tank's licence
        // to plant next to holdouts. Evidence gathered on one character should
        // apply to that character: the anchor now requires anchorBias.
        const holdoutAnchor = charOf().anchorBias > 0 &&
            !hpPanic && !markHere && !th.rival && !flight && armorConf > 0.05 &&
            th.passouts.some(po => !po.contested && !po.far &&
                (hyp(po.x - p.x, po.y - p.y) - po.r) < M.poEngageRange * 0.5);
        const anchor = flameAnchor || holdoutAnchor || (!hpPanic && hpRatio > 0.7 && !markHere && !projHere && !th.rival && !rainbowRecent && !flight &&
            (!dayPhaseNow || th.near <= 2 + charOf().anchorBias * 2) &&   // day: only anchor on a quiet field (manual run: crowd median 0)
            armorLevel() >= 2 &&   // v6.91.3
            (wallFocus || th.passouts.some(po => !po.contested && hyp(po.x - p.x, po.y - p.y) < 220)));
        // v6.88.2 CORNER ANCHOR — deliberate user strategy in deep hell, and
        // the source says why it works. Boss drop-marks spawn UNIFORMLY at
        // random inside [52, W-52] x [62, H-62] and are never aimed at the
        // player; their damage is player.maxHp*0.40 ('again') / *0.35
        // ('selfie'), so being a PERCENTAGE of max HP no amount of HP, armour
        // or regen defends against them — only standing somewhere they cannot
        // spawn does. At the true arena corner the nearest possible mark CENTRE
        // is 80.9 px away against a ~70 px reach: geometrically immune, versus
        // ~8.5% per mark in open field. Marks are 21-31% of all deaths.
        // Danger terms (marks, lanes, contact) still outrank this pull, so the
        // bot leaves the corner when something is actually landing on it.
        const gtCorner = typeof G.gameTime === 'number' ? G.gameTime : 0;
        // NOTE: deliberately NOT gated on hellDetected. 150 minutes can only
        // be hell, and if the latch was missed (a stray results-screen click,
        // a reload mid-run) the posture that matters most must still engage.
        // v6.88.4 (user): "deep hell once bosses don't drop tips and the boss
        // damage ring becomes as large as the canvas — anchor towards corner
        // and spam ultimate". The RING is the observable signal; the clock is
        // only a fallback for when no boss is on screen. Either fires it.
        const canvasW = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
        // ── v6.112.0 ringHuge READ THE FILTERED LIST, AND COULD NOT FIRE ────
        //
        // `th.enemies` is range-filtered. The gather keeps a boss beyond
        // `threat.enemyRange` only as a `distantBoss`, and that exemption
        // carries the clause `(!hellDetected || offRelevant || e.r <= 90 ||
        // frozenNow)` — so IN HELL a boss with r > 90 that is out of range is
        // dropped outright.
        //
        // r > 90 is precisely what "the bosses are too large" means. The test
        // wants r >= 0.55 * 540 / 2 = 148.5, and a boss that size centred on
        // the field sits ~345 px from the corner the bot is parked in, against
        // an enemyRange whose box maximum is 240. So the one signal the user's
        // whole deep-hell definition rests on was structurally unable to fire
        // in the posture it describes — the corner. The clock fallback
        // (cornerAnchorFromS) has been carrying the corner doctrine alone.
        //
        // "Is there a canvas-sized boss on the field" is a FIELD question, not
        // a proximity one. Read the raw array, exactly as the 6.108.0
        // saturation arm had to. Walls are excluded: a NO BOOKING wall is
        // large and stationary and is not the growing boss this describes.
        // v6.112.0 BOSS CENSUS — sample the RAW field, for the same reason
        // ringHuge now does: a boss the gatherer drops is still on the board
        // and still on the timetable. First sighting per id, then the radius
        // re-sampled on a coarse grid so r(t) can be fitted.
        {
            const rawB = Array.isArray(G.enemies) ? G.enemies : null;
            if (rawB && bossSeen) {
                const gtB = typeof G.gameTime === 'number' ? G.gameTime : 0;
                for (const e of rawB) {
                    if (!e || typeof e.r !== 'number') continue;
                    if (!(e.boss === true || String(e.type || '') === 'boss')) continue;
                    const id = e.id != null ? String(e.id) : (String(e.bossChar || e.type || '?') + '@' + Math.round(e.maxHp || 0));
                    let rec = bossSeen[id];
                    if (!rec) {
                        if (Object.keys(bossSeen).length >= 60) continue;   // bounded
                        rec = bossSeen[id] = {
                            gt: Math.round(gtB), r0: Math.round(e.r),
                            k: String(e.bossChar || e.type || '?'),
                            no: e.bossNo != null ? e.bossNo : null,
                            tier: e.tier != null ? e.tier : null,
                            hp0: Math.round(e.maxHp || e.hp || 0),
                            wall: e.wall === true || /nobook/i.test(String(e.bossChar || '') + ' ' + String(e.type || '')),
                            rs: []
                        };
                    }
                    // ── v6.115.0 THE WINDOW WAS TOO SHORT TO SEE THE GROWTH ────
                    // 12 samples at 30 s covered 360 s per boss. The first live
                    // census (n=60 runs, 82-236 sightings per kind) came back
                    // with growthPer100s = 0 for EVERY non-wall kind and r0 =
                    // 27-28 across the board — which would mean bosses never
                    // grow and `ringHuge` (r >= 149) could never fire.
                    //
                    // `bossHitRange` in the same report says otherwise: median
                    // reach 353, p95 370, max 697 on a 540 px canvas, up from a
                    // median of 200 one report earlier. Bosses plainly do grow.
                    // A boss first sighted at gt 630 was simply dropped at gt
                    // 990, hundreds of seconds before it got big.
                    //
                    // 48 samples at 120 s = 5760 s of coverage, which reaches
                    // past the regime opening (deepAt clustered 4808-5400).
                    //
                    // ── v6.116.0 AND IT MADE THE FIT IMPOSSIBLE INSTEAD ────
                    // The next report came back with growthPer100s NULL for 9
                    // of 10 kinds — worse than the 0s it replaced, because a
                    // null is not even a datum. Three samples at 120 s spacing
                    // need a boss to survive 240 s in a run whose MEDIAN LENGTH
                    // IS 854 s. The window was no longer too short; it was
                    // longer than the runs.
                    //
                    // A fixed interval cannot serve both ends. So decimate:
                    // sample fast, and when the 48 slots fill, drop every
                    // second sample and double this boss's own interval. The
                    // kept samples stay evenly spaced (the fit is unbiased),
                    // the early ones survive the thinning (r0 and the first
                    // minute are never lost), and the horizon doubles each
                    // time instead of being chosen in advance.
                    const cap = CONFIG.deepHell.bossCensusSamples != null ? CONFIG.deepHell.bossCensusSamples : 48;
                    if (rec.every == null) rec.every = CONFIG.deepHell.bossCensusEveryS != null ? CONFIG.deepHell.bossCensusEveryS : 15;
                    const last = rec.rs.length ? rec.rs[rec.rs.length - 1] : null;
                    if (!last || gtB - last[0] >= rec.every) {
                        rec.rs.push([Math.round(gtB), Math.round(e.r)]);
                        if (rec.rs.length >= cap) {
                            const thin = [];
                            for (let i = 0; i < rec.rs.length; i += 2) thin.push(rec.rs[i]);
                            rec.rs = thin;
                            rec.every *= 2;
                        }
                    }
                }
            }
        }
        const ringShare = CONFIG.deepHell.ringShare != null ? CONFIG.deepHell.ringShare : 0.55;
        const ringHuge = (() => {
            const raw = Array.isArray(G.enemies) ? G.enemies : th.enemies;
            for (const e of raw) {
                if (!e || typeof e.r !== 'number') continue;
                const isBoss = e.boss === true || String(e.type || '') === 'boss';
                if (!isBoss) continue;
                if (e.wall === true || /nobook/i.test(String(e.bossChar || '') + ' ' + String(e.type || ''))) continue;
                if (e.r * 2 >= canvasW * ringShare) return true;
            }
            return false;
        })();
        // v6.89.3 (user): "kiting for unkillable mobs is useless, and anchoring
        // in corner with southside to theoretically be able to kill the contact
        // mobs is better in order to land a timestop ... so anchoring might be
        // able to be employed much earlier ... except to hunt down bosses."
        //
        // That is a complete doctrine, and it inverts the old gate. Kiting only
        // pays while the pack can be outrun and killed; past the point where mob
        // HP has scaled beyond the build, dragging a conga line achieves nothing
        // except covering ground. The corner does two things kiting cannot: it
        // collapses the approach arc from 360 degrees to about 90, and it parks
        // the SOUTH SIDE burn — which is BODY-CENTRED — exactly where the funnel
        // delivers bodies. Kills are how a TIME STOP drops, and the time stop is
        // what the whole deep build runs on.
        //
        // So the corner no longer waits for a clock at all when the burn exists:
        // hell + SOUTH SIDE owned is the condition. The clock and the huge ring
        // stay as fallbacks for a build that never got the zoner.
        //
        // THE EXCEPTION IS THE USER'S OWN: a boss on the field is worth breaking
        // the corner for. That also keeps the 1800-4800 tip window intact, since
        // farming frozen bosses IS boss hunting — the phase that funds the run
        // is protected by the same clause that names it.
        // ...and the exception is SCOPED to the phase that makes it true. In
        // deep hell there is essentially always a boss on the field, so a bare
        // "any boss breaks the corner" would switch the corner off forever —
        // the same dead-gate mistake in reverse. Bosses are worth hunting while
        // they still DROP TIPS; the doctrine's own definition of deep hell is
        // the moment they stop. So the hunt exception expires with the window.
        const tipOpen = gtCorner < (CONFIG.deepHell.tipWindowToS || 4800);
        // v6.89.5 (user): "bot should hunt down time stopped or frozen bosses
        // early to kill them before they cause severe damage though."
        //
        // A frozen boss is the one target on the field that cannot fight back,
        // and every one left alive comes back later as the thing that ends the
        // run. So this exception is NOT scoped to the tip window the way plain
        // boss-hunting is: a free kill is worth leaving the funnel for at any
        // depth. Same predicate the stacking station uses below (>= 45 frames
        // left), so the corner releases exactly when that station would engage,
        // rather than the two fighting over the heading.
        const frozenBossHere = th.enemies.some(e =>
            e.boss && !e.wall && e.frozen && (e.frozenLeft || 0) >= 45);
        const bossHunt = frozenBossHere || (th.boss === true && tipOpen) || !!th.rival;
        const zonerCorner = CONFIG.deepHell.cornerWithZoner !== false && hellDetected && zoner;
        // v6.89.8 PANIC AND FLIGHT MEAN *GO TO THE CORNER*, NOT GO ANYWHERE.
        //
        // This gate was the real reason the corner never held. `flight` is
        //   hellDetected && !pauseActive && unkillable && near >= 4 && !hpPanic
        // and at depth every one of those is permanently true except during a
        // time stop — `toughnessAvg` is enormous, `near` is in the hundreds. So
        // `!flight` switched the corner OFF for all of deep hell EXCEPT the
        // seconds a pause was holding the field. Sixty versions of corner
        // doctrine, `cornerAnchorFromS`, `cornerWithZoner` and `cornerPull` were
        // all downstream of a term that was almost never allowed to fire. It
        // explains the 127 px `cornerDist` measured at 120 minutes far better
        // than "cornerPull is losing to the flee terms" did — the corner pull
        // was not losing the argument, it was not in the room.
        //
        // `hpPanic` is the same mistake in miniature: the moment the bot is
        // actually hurt is the moment it most needs the mark-immune corner, and
        // that is exactly when the gate revoked it.
        //
        // Past `deepCornerFromS` both are demoted from vetoes to non-events:
        // running away and panicking both resolve to "get to the corner", which
        // is the only place at depth where anything is safer (marks cannot reach
        // it — 80.9 px against a 70 px reach). Shallow hell and the day are
        // untouched: there, fleeing genuinely opens a gap and the veto is right.
        //
        // `markHere` still breaks it — standing inside a falling attack is the
        // one time to move regardless — and so does `bossHunt`.
        const deepCorner = hellDetected &&
            gtCorner > (CONFIG.deepHell.deepCornerFromS != null ? CONFIG.deepHell.deepCornerFromS : 2400);
        // Corner coordinates, hoisted above the gate: v6.89.11 needs to ask
        // whether the SEAT is safe, not only where the bot is standing.
        const fieldW = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
        const fieldH = (typeof G.H === 'number' && G.H > 0) ? G.H : CONFIG.field.h;
        // v6.91.3 THE SEAT WAS INSIDE THE MARKS THE WHOLE TIME.
        //
        // The corner doctrine's entire justification is "80.9 px from the
        // nearest possible mark centre against a 70 px reach". That 80.9 is the
        // distance from the TRUE corner (0,0) to the nearest spawnable mark
        // centre (52,62) — source-verified spawn box [52,W-52] x [62,H-62].
        //
        // The code never sat there. It seated at (p.r, p.r), and the live player
        // radius is 7.2:
        //
        //   seat (0,0)     -> 80.92 px   margin +10.92   IMMUNE
        //   seat (7.2,7.2) -> 70.78 px   margin  +0.78   a hair
        //   seat (12,12)   -> 64.03 px   margin  -5.97   INSIDE THE MARK
        //
        // and 12 is the fallback whenever `p.r` cannot be read. So the seat was
        // never the seat the doctrine describes; it was 10 px in, with the whole
        // claimed margin spent. That is the best available explanation for the
        // one non-noise number in the last compare() dump: across the 22 runs
        // where the corner FIRST actually worked (6.90.0 fixed the thrower
        // regression that had disabled it outright), mark deaths went 19% -> 45%,
        // z ~ 3.2. Enabling a seat that sits inside every mark that can exist is
        // exactly what that looks like.
        //
        // The planner's own candidate clamp is Math.max(0, Math.min(fw, ...)),
        // so the centre is allowed at 0. If the GAME clamps to [r, W-r] the bot
        // simply stops at 7.2 and `parked` still latches (parkRadius 26) — this
        // costs nothing if it turns out to be unreachable, and buys the entire
        // claimed margin if it is not.
        const cornerInset = (CONFIG.deepHell.cornerInset != null) ? CONFIG.deepHell.cornerInset : 0;
        const cnrX = (p.x < fieldW / 2) ? cornerInset : fieldW - cornerInset;
        const cnrY = (p.y < fieldH / 2) ? cornerInset : fieldH - cornerInset;
        // v6.89.11 THE CORNER DOES NOT DEFEAT A CHARGE LANE (user: "anchoring
        // contradicting the linebacker boss").
        //
        // The corner earns its place against DROP-MARKS, which are bounded
        // circles from a known spawn box — the true corner sits 80.9 px from the
        // nearest possible mark centre against a 70 px reach, so it is outside
        // every mark that can exist. That argument does not transfer.
        //
        // A Last Call Linebacker charge lane is `{x, y, ang, armed, dmg}` — an
        // unbounded RAY, killing 63 px to each side by perpendicular distance.
        // No point in the arena is outside a ray. Corner position confers
        // exactly zero protection, and it makes matters worse: escaping a lane
        // means moving perpendicular to it, and a corner has removed three
        // quarters of the directions available to do that.
        //
        // The gate had no lane term at all. It checked `markHere` and nothing
        // else, and at depth `bossHunt` only fires for a FROZEN boss or a rival
        // — so a live charging linebacker could not break the anchor either.
        //
        // Unarmed lanes count on purpose: `armed: false` is the telegraph, which
        // is precisely the window in which not to commit to a seat that is about
        // to become a kill zone. Breaking the corner hands the heading back to
        // lineCost's gradient, which drives the perpendicular step.
        //
        // v6.89.13 REGRESSION FIX — THE CORNER WAS PERMANENTLY DISABLED.
        // A live probe at gt 7622 returned `lineOnCorner: true` with
        // `lines: 0` — zero roadLines in the game, yet the veto was firing.
        //
        // `th.lines` is not only roadLines. A THROWER in its vomit windup
        // pushes a SYNTHETIC segment `{x1: e.x, y1: e.y, x2: p.x, y2: p.y}`
        // (see the gather above) — a firing line drawn from the thrower TO THE
        // PLAYER, so it can be pre-dodged. That segment ENDS at the player's
        // exact position, so `lineCost(l, p.x, p.y)` is a zero-distance hit and
        // returns 1 every single time. Any thrower winding up anywhere on the
        // field therefore made `lineHere` true, which made `lineOnCorner` true,
        // which switched the corner off — and at depth there is always a
        // thrower winding up.
        //
        // Only REAL charge lanes may veto the corner. The source-verified
        // roadLine shape carries a numeric `ang`; the synthetic thrower line
        // does not, and it is already handled by laneUrgent and the flee terms.
        const laneCovers = (x, y) => th.lines.some(l =>
            l && typeof l.ang === 'number' && lineCost(l, x, y) > 0.15);
        const lineHere = laneCovers(p.x, p.y);
        const lineOnCorner = laneCovers(cnrX, cnrY) || lineHere;
        // v6.111.0: normalise the escape vector accumulated by the laneUrgent
        // loop. Deferred to here only because `fieldW`/`fieldH` are declared
        // above this point and the wall check needs them.
        let laneEscape = null;
        if (laneCov > 0) {
            const lm = hyp(laneEx, laneEy);
            if (lm > 1e-6) {
                let ex = laneEx / lm, ey = laneEy / lm;
                // Both perpendiculars leave the lane; only one of them leaves
                // the ARENA. If the shortest exit runs into a wall inside the
                // margin, take the other side — a longer walk out beats being
                // pinned against the edge while the charge fires.
                const mgL = CONFIG.field.margin;
                const ahead = 46;
                const ax = p.x + ex * ahead, ay = p.y + ey * ahead;
                if (ax < mgL || ay < mgL || ax > fieldW - mgL || ay > fieldH - mgL) {
                    const bx = p.x - ex * ahead, by = p.y - ey * ahead;
                    if (bx >= mgL && by >= mgL && bx <= fieldW - mgL && by <= fieldH - mgL) { ex = -ex; ey = -ey; }
                }
                laneEscape = { x: ex, y: ey };
            }
        }
        // v6.91.0 THE DORMANT-BOSS HUNT.
        //
        // A boss whose whole body sits beyond the play rectangle cannot be hit
        // by anything the player owns and cannot hit the player back. It is a
        // free target that becomes an expensive one the moment it drifts in —
        // and at depth "expensive" means a single hit that ends the run. The
        // only window in which it can be fought on our terms is while it is
        // still out there.
        //
        // Implemented as an OVERRIDE, not a gain term, for the reason 6.89.11
        // measured the hard way: a pull competing with a dozen other gain terms
        // moved the bot 127 px in 120 minutes and showed z = -0.06 against the
        // version without it. Park works because it zeroes movement outright.
        // The hunt has to be the same kind of object or it will not fire.
        //
        // Three bounds, because this deliberately walks out of the only stable
        // seat on the board:
        //   * DORMANT ONLY. The instant the body edge touches the field the
        //     flag clears and normal doctrine — corner, park, the boss ring —
        //     takes the fight back. We never chase something that can hit us.
        //   * A CLOCK. `dormantHuntS` seconds per attempt, then a rest. If the
        //     weapons cannot reach the sliver from the post, the bot finds that
        //     out once and goes home instead of standing at the edge forever.
        //   * A SEAT CHECK. Panic, a mark underfoot, a live charge lane, the
        //     finale rival or low HP all cancel it. The hunt is an opportunity,
        //     never an emergency.
        //
        // v6.91.1 — WHAT "WAKES UP" MEANS, ANSWERED BY THE USER: A TIME STOP
        // ENDING. The live probe returned exactly one off-canvas boss and it was
        // `frozen: true` (boss_glass, r 131, hp 6.03e9). So the dangerous object
        // is not a boss asleep on a timer; it is a boss the player FROZE, parked
        // where nothing can reach it, whose thaw lands a huge contact hit.
        //
        // That is the karaoke lesson the codebase already states for the
        // on-canvas case — "leave BEFORE it wakes" — and the frozen window is a
        // far better clock than my arbitrary 20 seconds, because it is the real
        // deadline rather than a guess.
        //
        // PARK WAS ALSO OUTRANKING A FREE KILL. `frozenBossHere` releases the
        // CORNER (a frozen boss is worth leaving the funnel for at any depth),
        // but 6.90.0's park has no such exception and simply zeroes movement.
        // Every frozen boss since then has been ignored at depth. The hunt now
        // covers both cases and sits above park, which fixes that too.
        let huntTarget = null;
        const DHh = CONFIG.deepHell;
        const frozenMin = DHh.huntFrozenMinFrames != null ? DHh.huntFrozenMinFrames : 45;
        if (DHh.dormantHunt !== false && hellDetected) {
            for (const e of th.enemies) {
                if (!e.boss || e.wall) continue;
                // OFF-CANVAS ONLY. The on-canvas frozen boss already has a
                // better answer than anything here: the demo-tuned two-phase
                // stacking station (burn ring while the freeze has time, falling
                // back to the safe 150 as it runs down). Overriding that with a
                // flat max(150, r+90) post BROKE it — the `item-stop` suite
                // caught the regression immediately. What park actually did to
                // that boss was zero its movement, and the fix for that is to
                // release park, not to re-implement the station.
                if (!e.offCanvas) continue;
                const isFroz = e.frozen && (e.frozenLeft || 0) >= frozenMin;
                if (!isFroz && !e.dormant) continue;
                // A frozen target outranks a merely dormant one: its window is
                // closing, the other's is not.
                if (!huntTarget) { huntTarget = e; continue; }
                const wasFroz = huntTarget.frozen && (huntTarget.frozenLeft || 0) >= frozenMin;
                if (isFroz && !wasFroz) huntTarget = e;
                else if (isFroz === wasFroz && e.gapField < huntTarget.gapField) huntTarget = e;
            }
        }
        const gtHunt = safe(() => gameTime, 0) || 0;
        const hmg = DHh.dormantHuntMargin != null ? DHh.dormantHuntMargin : 8;
        let huntOn = false, huntPost = null, huntVacate = false;
        if (huntTarget) {
            // THE POST. For a DORMANT boss it is the field point nearest the
            // centre — the closest a clamped player can physically get. For a
            // frozen boss whose body IS reachable it is the existing stacking
            // station (~150px out, demo-measured: the manual stall run never
            // hugged a paused body, p10 140 / med 254), so the wake-up burst
            // cannot reach the seat we chose.
            const bx = huntTarget.x, by = huntTarget.y;
            const dpb = hyp(p.x - bx, p.y - by) || 1;
            const postRing = huntTarget.dormant ? 0 : Math.max(150, (huntTarget.r || 40) + 90);
            huntPost = {
                x: Math.max(hmg, Math.min(fieldW - hmg, bx + (p.x - bx) / dpb * postRing)),
                y: Math.max(hmg, Math.min(fieldH - hmg, by + (p.y - by) / dpb * postRing))
            };
            // LEAVE BEFORE IT WAKES, computed rather than guessed: the walk home
            // is a real distance at a real speed, so the margin is
            // (distance post->seat / speed) + a fixed slack. A short freeze on a
            // far post is correctly refused outright.
            const frozenLeftS = (huntTarget.frozen && huntTarget.frozenLeft > 0)
                ? huntTarget.frozenLeft / 60 : Infinity;
            const pxPerS = Math.max(0.5, (typeof p.speed === 'number' && p.speed > 0)
                ? p.speed : M.playerSpeed) * 60;
            const homeS = hyp(huntPost.x - cnrX, huntPost.y - cnrY) / pxPerS;
            huntVacate = frozenLeftS <= homeS + (DHh.huntVacateS != null ? DHh.huntVacateS : 0.75);
        }
        if (!huntTarget) {
            huntStartS = null;
        } else if (hpPanic || markHere || lineHere || th.rival || rainbowRecent ||
                   hpRatio < (DHh.dormantHuntHp != null ? DHh.dormantHuntHp : 0.6)) {
            huntStartS = null;   // the seat check failed — abandon, don't bank the time
        } else if (huntVacate) {
            huntStartS = null;   // the thaw is closer than the walk home
        } else if (gtHunt >= huntRestUntilS) {
            if (huntStartS == null || huntStartS > gtHunt) huntStartS = gtHunt;
            if (gtHunt - huntStartS <= (DHh.dormantHuntS != null ? DHh.dormantHuntS : 20)) {
                huntOn = true;
            } else {
                huntRestUntilS = gtHunt + (DHh.dormantHuntRestS != null ? DHh.dormantHuntRestS : 45);
                huntStartS = null;
            }
        }
        if (!huntOn) huntPost = null;
        // v6.91.1 THE HUNT MEASURES ITSELF. That boss had 6.03 BILLION hp at 46
        // minutes. Whether anything we own moves that number is unknown, and
        // guessing is what this project keeps paying for — so every attempt
        // books the boss's hp on arrival and on departure. If `dmg` stays at
        // zero across a few dozen attempts, the hunt is a 20-second walk that
        // accomplishes nothing and should become a warning posture instead.
        if (huntOn && huntTarget) {
            if (!huntMark || huntMark.id !== huntTarget.id) {
                huntMark = { id: huntTarget.id, hp0: huntTarget.hp, hp: huntTarget.hp, t0: gtHunt, froz: !!huntTarget.frozen };
            } else if (typeof huntTarget.hp === 'number') huntMark.hp = huntTarget.hp;
        } else if (huntMark) {
            // "gone" means the id left the enemy list while we were on it. That
            // is a kill OR a despawn — the audit books it as `vanished`, not as
            // a kill, because nothing here can tell the two apart.
            huntMark.gone = !th.enemies.some(e => e.boss && e.id != null && e.id === huntMark.id);
            bookHunt(huntMark, gtHunt);
            huntMark = null;
        }
        const cornerOn = !huntOn && !markHere && !lineOnCorner && !bossHunt &&
            (deepCorner || (!hpPanic && !flight)) &&
            (zonerCorner || ringHuge || gtCorner > (CONFIG.deepHell.cornerAnchorFromS || 9000));
        // USER-VERIFIED: Corpse Reviver zombies can hit NEITHER passouts NOR
        // no-booking walls — a CR-only build farms both at base-attack speed,
        // so the detour incentive is cut for each. (Hoisted out of the
        // candidate loop — audit fix: was recomputed 33x per tick, twice.)
        const crOnly = (ownedLevels['CORPSE REVIVER NO.2'] || 0) > 0 && ownedCocktailCount() === 1;
        const crOnlyW = crOnly;
        // USER DIRECTIVE: the first 20 minutes are the FUNDING phase — kill
        // every NO BOOKING wall, passout, and boss to bankroll the rainbow
        // path before the finale. Farm pulls are amplified until 1200s.
        // ...and MINUTE ONE is the sprint (user directive): kill mobs and
        // passouts flat-out so the first attack upgrade lands BEFORE the
        // first NO BOOKING wall spawns on the timetable.
        const gtNow2 = typeof G.gameTime === 'number' ? G.gameTime : 0;
        // v6.97.0: the minute-one sprint is for characters with the HP to
        // survive being wrong in the middle of the first wave — see the
        // sprintMinHp config comment. 13 of joe's 28 day deaths sat at
        // 59-85 s before this gate existed.
        const sprintable = (charOf().hp || 100) >= (M.sprintMinHp != null ? M.sprintMinHp : 120);
        const dayFarmBase = (!hellDetected && gtNow2 < 60)
            ? (sprintable ? 1.7 : (M.fragileSprintMul != null ? M.fragileSprintMul : 1.0))
            : ((gtNow2 < 1200 && !hellDetected) ? 1.35 : 1);
        const dayFarm = dayFarmBase *
            (1 + 0.45 * buildHunger) *  // starving build: kills ARE the upgrades — hunt harder
            (flameOn ? 1.6 : 1) *       // burn window: harvest everything it touches
            // v6.111.0 SPEND THE WINDOW. `ultInvuln` has relaxed `caution` by
            // 0.35 since 6.86.1, which only ever made the bot less afraid —
            // it never made it go anywhere. Inside a window with room left to
            // disengage, nothing on the field can hurt us and every second
            // spent maintaining standoff is a second of the run's scarcest
            // resource thrown away. This is the same doctrine the ult firing
            // gate already runs on, applied to the leg the ult was cast for:
            // fire it, then go and collect something with it.
            //
            // Deliberately gated on ultInvulnSafe, not ultInvuln. Pat's and
            // minguk's windows are ~2.3-2.8 s; committing to a pull in the
            // last half second of one is how a window becomes a death.
            (ultInvulnSafe ? (M.ultWindowFarmMul != null ? M.ultWindowFarmMul : 1.5) : 1) *
            (flight ? 0.15 : 1);        // FLIGHT: nothing is worth stopping for

        // ULT AIMING. The ultimate spirals OUTWARD from the bot, so the aim
        // point is where the bot's body should be when it fires.
        // v6.85.8 (user): "the ultimate for Pat is different from minguk's in
        // that it spirals out and the passouts NEAREST the ultimate get the
        // most damage." A flat centroid is the wrong aim under falloff — it
        // averages a spread-out group into a point that can be far from every
        // member of it. Weighting each passout by 1/(d+60) collapses the aim
        // onto the densest nearby cluster instead, and leaves a single
        // point-blank passout as a perfectly good target.
        const ultFall = charOf().ultFalloff === true;
        // v6.86.4: banking is only worth positioning for when the blast is near
        // v6.86.12: banking only makes sense for an ult that must be NEAR its
        // targets. Minguk's nuke hits every enemy on the field at any range
        // and explicitly includes passouts, so walking his 120 HP into the
        // pile at 4x the normal pull weight buys nothing and spends the
        // spacing that keeps a runner alive. Harvest is for melee ults.
        // (Moved above the centroid/cluster computation in 6.129.0 so that
        // computation can gate on it directly.)
        const meleeUlt = charOf().ultKind && charOf().ultKind !== 'nuke';
        // v6.129.0 CLUSTER-AWARE AIM (user: "movement very close or
        // inbetween passouts and use ultimates from there... using like a
        // k-means clustering would allow them to kill them more
        // effectively"). A single distance-weighted mean over every nearby
        // passout has a real failure mode: with TWO separated piles of
        // comparable size and distance, the mean sits in the gap BETWEEN
        // them — nobody's actual position — and a fixed-radius spiral/aura
        // fired there catches fewer bodies than standing in either pile
        // alone. What decides a spiral/aura's yield is COVERAGE: how many
        // passouts sit within ultReach of wherever the bot stands. Rather
        // than run a generic k-means (which needs a k picked in advance and
        // iterates to converge, without ever knowing the ult's actual
        // radius), this treats every nearby passout as a candidate circle
        // CENTER for MELEE-ULT characters only (Pat's spiral, Joe's aura —
        // this is meaningless for Minguk's nuke, which hits the whole field
        // regardless of position, same doctrine as the comment above),
        // scores each candidate by how much of the pool a circle of radius
        // ultReach around it would cover (falloff-weighted the same way the
        // old mean was), and walks toward the WINNING candidate's own
        // sub-centroid — the densest reachable cluster, not an average of
        // every pile on the field. A single isolated body, or one obvious
        // pile, still resolves to exactly the old point-blank/centroid
        // target; the difference only shows once two-or-more separated
        // piles are both in range. Minguk keeps the plain flat/falloff mean
        // over the WHOLE pool exactly as before — his positioning doesn't
        // benefit from clustering and this must not move his plans.
        const ultR = charOf().ultReach;
        const poReach = (typeof ultR === 'number' && isFinite(ultR) && ultR > 0) ? ultR : 150;
        const poPool = [];
        for (const po of th.passouts) {
            if (po.contested) continue;
            const dpo = hyp(po.x - p.x, po.y - p.y);
            if (dpo >= 240) continue;
            poPool.push({ po, dpo });
        }
        let poNearest = null;
        for (const c of poPool) if (poNearest == null || c.dpo < poNearest) poNearest = c.dpo;
        let poCx = 0, poCy = 0, poN = 0, poW = 0;
        if (meleeUlt) {
            // Candidate pools this size are always small (a "backlog" is
            // ~20-24 bodies at the worst observed), so the O(n^2) coverage
            // scan below costs nothing next to the enemy candidate loop it
            // sits beside.
            let bestAnchor = null, bestScore = -1;
            for (const cand of poPool) {
                let score = 0;
                for (const q of poPool) {
                    const dq = hyp(q.po.x - cand.po.x, q.po.y - cand.po.y);
                    if (dq <= poReach) score += ultFall ? 1 / (dq + 60) : 1;
                }
                if (score > bestScore) { bestScore = score; bestAnchor = cand.po; }
            }
            if (bestAnchor) {
                for (const cand of poPool) {
                    const dq = hyp(cand.po.x - bestAnchor.x, cand.po.y - bestAnchor.y);
                    if (dq > poReach) continue;   // only the winning cluster's own members shape the aim
                    const w = ultFall ? 1 / (cand.dpo + 60) : 1;
                    poCx += cand.po.x * w; poCy += cand.po.y * w; poW += w; poN++;
                }
            }
        } else {
            for (const c of poPool) {
                const w = ultFall ? 1 / (c.dpo + 60) : 1;
                poCx += c.po.x * w; poCy += c.po.y * w; poW += w; poN++;
            }
        }
        if (poW) { poCx /= poW; poCy /= poW; }
        // v6.93.3 (user): "the feed filler boss marks are disrupting the
        // ultimate usage and not allowing the bot to get in optimal position
        // to kill passouts." markHere covers a mark-radius + 50px halo, so a
        // mark-spamming boss near the pile kept the harvest gated off across
        // a wide band. But a mark is a 40%-of-maxHp hit (mitigation model) —
        // an AFFORDABLE price for a pile that funds the build — and the cast
        // itself is an invulnerability window that eats a landing outright.
        // So a mark only blocks the harvest when the bot cannot afford to
        // soak it: below harvestMarkSoakHp a 40% hit would drop the bot near
        // the panic line, and the old caution returns.
        // v6.93.3b (screenshot, 14:03 pat run): the live bot sat at 69% HP
        // with a +117 SHIELD under a 26-mark carpet — the shield eats a mark
        // landing before HP does, so affordability counts both pools.
        const shieldNow = Math.max(0, safe(() => player.shield, 0) || 0);
        // v6.95.1: for the fragile profile (joe, no regen) a 40%-maxHp mark
        // is 40 PERMANENT HP on a 100 HP pool — soakable only behind a real
        // NEGRONI shield, never on raw HP.
        const msNeed = charOf().markShield;
        const markSoak = ((hp + shieldNow) / Math.max(1, maxHp) >=
            (M.harvestMarkSoakHp != null ? M.harvestMarkSoakHp : 0.65)) &&
            (msNeed == null || shieldNow >= msNeed);
        // v6.99.1 FUND RUSH (user: "it's not hyper-aggressive with using
        // ultimates to clear passouts to fund the weapon upgrades"). The
        // 6.99.0 armor waiver opened a door these two vetoes kept shut:
        // projHere is a 130px halo — true nearly always on a day field
        // laced with common projectile mobs — and the feed filler's landed
        // litter keeps markHere lit across whole regions. With the ult
        // READY the cast on arrival covers marks and shots both (the
        // manual demo walks the crossfire at 3.0 and casts from ~91px), so
        // only a shot in true collision range (fundProjPx) still blocks.
        const litterN = th.marks.reduce((n, m) => n + (m.litter ? 1 : 0), 0);
        // fundRushHp: the rush is for a HEALTHY bot — the demo held hp median
        // 100. A hurt bot keeps every old caution (the po-harvest "too hurt
        // to soak the mark" doctrine stands below this floor).
        // v6.99.2: the rush stands down at entryPrepFromS — the last day
        // minutes belong to arriving at the entrance armored (see config).
        // The ult condition is ready-OR-imminent, matching ultHarvest: the
        // demo drifts onto the pile as the cast comes off cooldown, so by
        // arrival the cover is castable.
        const gtFund = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const fundRush = (M.fundRush !== false) && dayPhaseNow &&
            (ultReadyNow || ultInS <= M.ultHarvestLeadS) &&
            gtFund < (M.entryPrepFromS != null ? M.entryPrepFromS : 1050) &&
            hpRatio >= (M.fundRushHp != null ? M.fundRushHp : 0.65);
        const projTight = th.projectiles.some(q =>
            hyp(q.x - p.x, q.y - p.y) < q.r + (M.fundProjPx != null ? M.fundProjPx : 45));
        const ultHarvest = meleeUlt && poN >= 1 && (ultReadyNow || ultInS <= M.ultHarvestLeadS) &&
            !hpPanic && (!markHere || markSoak || fundRush) && !(fundRush ? projTight : projHere);

        // FIELD TREK (v6.85.10, user: "it needs to clear all bosses including
        // no booking mobs and passouts in day" — with a 17:59 screenshot
        // showing ~20 uncleared passouts). Once nothing farmable is left in
        // the local window the bot had no reason to go anywhere, so it sat and
        // re-farmed its corner while the far pile grew. Pick exactly ONE
        // distant target and walk to it: oldest first, since they despawn and
        // the user's kill order is FIFO, frailest as the tie-break. Day only
        // (hell is about survival, not the floor), healthy only, and never
        // while a NO BOOKING wall or the finale rival owns the field.
        const gtTrek = typeof G.gameTime === 'number' ? G.gameTime : 0;
        let trekPo = null;
        if (!hellDetected && gtTrek < 1200 && !hpPanic && !th.rival && !rainbowRecent && !wallFocus &&
            !th.passouts.some(po => !po.contested && !po.far)) {
            for (const po of th.passouts) {
                if (po.contested || !po.far) continue;
                if (!trekPo || po.id < trekPo.id ||
                    (po.id === trekPo.id && po.maxHp < trekPo.maxHp)) trekPo = po;
            }
        }

        // CONTACT IMMINENT (hell): a live body whose predicted step lands on
        // us. In hell these scale past what the supers can kill, so the only
        // answers are the dash and the ult's invincibility window.
        let contactImminent = false;
        if (hellDetected && !pauseActive) {
            const horizon = 12 + (DH.horizonFrames - 12) * depth;   // deep hell: see the lunge earlier
            for (const e of th.enemies) {
                if (e.wall || e.frozen) continue;
                if (e.distant) continue;   // v6.88.0 AUDIT D3: off-canvas, gathered only for the ring
                const fx2 = e.x + e.vx * horizon, fy2 = e.y + e.vy * horizon;   // ~0.2s ahead (longer at depth)
                const pad = ((e.boss || e.rival) ? 26 : 12) * (1 + (DH.bossPadMul - 1) * depth);
                if (hyp(fx2 - p.x, fy2 - p.y) < e.r + pad) { contactImminent = true; break; }
            }
        }

        // TIME-STOP STACKING (user): during an item time pause in hell with
        // SOUTH SIDE owned, the paused boss is a free damage sponge — stand
        // ON it and let the burn zones stack. Only while the freeze has
        // ≥0.75s left (the karaoke lesson: leave BEFORE it wakes).
        // v6.85.11 (user: "the bot is not using SOUTH SIDE attacks well for
        // frozen bosses in hell"). `!projHere` gated the WHOLE branch, and
        // projHere is true whenever any enemy shot sits within q.r + 130 —
        // which in hell is very nearly always. The stacking window therefore
        // almost never opened in a real run. A frozen boss cannot act; the
        // reason to fear a shot is unrelated to whether we stack on it, and
        // the danger field still routes around live projectiles on its own.
        let stopBoss = null;
        if (hellDetected && zoner) {
            for (const e of th.enemies) {
                if (!e.boss || e.wall || !e.frozen || e.frozenLeft < 45) continue;
                const dd = hyp(e.x - p.x, e.y - p.y);
                if (!stopBoss || dd < stopBoss.d) stopBoss = { x: e.x, y: e.y, d: dd, r: e.r, left: e.frozenLeft, id: e.id };
            }
        }

        // Hoisted so the reported diagnostic is literally the number the
        // planner steers to — a separately-computed label can drift from the
        // behaviour and then "tests" the label instead of the bot.
        // v6.88.4 (user): "30-80 minutes hell - fast kill of frozen bosses via
        // timestop or whisky sour by sitting ON TOP of their damage circle
        // while the bosses still drop tips". Tips are the SUPER EVOLUTION
        // TRIGGER (openRecipe: "base attack MAX + cocktail Lv6 + key MAX ->
        // evolve at a BOSS TIP"), so this window is where the four-line plan
        // actually cashes in — and a frozen boss cannot punish contact. The
        // zone-damage predicate is `hypot(e.x-z.x, e.y-z.y) < z.r + e.r`, i.e.
        // SOUTH SIDE's burn lands on the hitbox circle, so standing on it is
        // where the damage is. Outside that window the old standoff stands.
        const gtStop = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const tipWindow = hellDetected &&
            gtStop >= (CONFIG.deepHell.tipWindowFromS || 1800) &&
            gtStop <= (CONFIG.deepHell.tipWindowToS || 4800);
        const stopStation = stopBoss
            // ...but ONLY while the freeze is actually holding. The first cut
            // dropped the station to point-blank for the whole window and the
            // existing time-stop tests caught it: parked on the hitbox with the
            // pause running out is exactly where the wake-up burst lands. The
            // >120-frame guard is the same one the old close-station used.
            ? ((tipWindow && (stopBoss.left || 0) > 120) ? Math.max(20, (stopBoss.r || 40) * 0.5)
                : ((stopBoss.left || 0) > 120 ? (stopBoss.r || 40) + 40 : Math.max(150, (stopBoss.r || 40) + 90)))
            : null;

        // v6.86.7 FLAME AIM. While the cross burns, the damage goes where the
        // bot is FACING — so choose what to point at before scoring headings.
        // Priority follows what the burn can actually cash in: a passout it
        // could never out-damage otherwise, then a wall, then a boss, then
        // whatever is closest.
        let flameTarget = null;
        if (flameOn && !hpPanic) {   // hurt: survive first, the burn is offence
            let bestF = -Infinity;
            const consider = (x, y, w) => {
                const d = hyp(x - p.x, y - p.y);
                if (d > M.flameAimRange) return;
                const sc = w / (1 + d / 200);
                if (sc > bestF) { bestF = sc; flameTarget = { x, y, d }; }
            };
            // v6.93.3 (user): "flame cross also has pierce so it can kill
            // multiple passouts at once if you angle the flame cross
            // correctly." So the right aim is not the best single passout but
            // the RAY through the most of them: for each candidate, count the
            // pile-through — passouts lying inside a 42px half-width corridor
            // along the ray from the bot through the candidate — and let that
            // count dominate the choice. Distance only breaks ties.
            const poList = th.passouts.filter(po => !po.far);
            const rayCount = (tx, ty) => {
                const rdx = tx - p.x, rdy = ty - p.y, L = hyp(rdx, rdy) || 1;
                const ux = rdx / L, uy = rdy / L;
                let n = 0;
                for (const q of poList) {
                    const qx = q.x - p.x, qy = q.y - p.y;
                    if (qx * ux + qy * uy < 0) continue;          // behind the stream
                    if (Math.abs(qx * uy - qy * ux) <= 42) n++;   // inside the corridor
                }
                return n;
            };
            for (const po of poList) {
                const d = hyp(po.x - p.x, po.y - p.y);
                if (d > M.flameAimRange) continue;
                const sc = rayCount(po.x, po.y) * 3 + 3 / (1 + d / 200);
                if (sc > bestF) { bestF = sc; flameTarget = { x: po.x, y: po.y, d, po: true }; }
            }
            // v6.94.0 THE STAND POINT. The rays above run from the bot's
            // CURRENT position — fine for aiming a burn mid-fight, wrong for
            // choosing where to stand: from broadside, no ray through one
            // passout crosses another, and walking to the pile CENTROID puts
            // bodies on both sides of a stream that fires one way. So the
            // stand is chosen from the pile's own geometry: for each ordered
            // pair (A,B), count passouts inside the 42px corridor along
            // A->B; stand flameStandOff px OUTSIDE A, facing down the line.
            // The harvest override walks there and then keeps CREEPING along
            // the line — the passout body blocks the walk (obstacles deal no
            // contact damage) and the push keeps the facing locked down it.
            if (flameTarget && poList.length >= 1) {
                let bS = -Infinity, stand = null;
                const off = M.flameStandOff != null ? M.flameStandOff : 55;
                for (const A of poList) {
                    for (const B of poList) {
                        let ldx, ldy;
                        if (B === A) {
                            if (poList.length > 1) continue;
                            const dpa = hyp(A.x - p.x, A.y - p.y) || 1;
                            ldx = (A.x - p.x) / dpa; ldy = (A.y - p.y) / dpa;
                        } else {
                            const L2 = hyp(B.x - A.x, B.y - A.y) || 1;
                            ldx = (B.x - A.x) / L2; ldy = (B.y - A.y) / L2;
                        }
                        let n = 0;
                        for (const q of poList) {
                            const qx = q.x - A.x, qy = q.y - A.y;
                            const proj = qx * ldx + qy * ldy;
                            if (proj < -1) continue;
                            if (Math.abs(qx * ldy - qy * ldx) <= 42) n++;
                        }
                        const sx = A.x - ldx * ((A.r || 37) + off);
                        const sy = A.y - ldy * ((A.r || 37) + off);
                        const sc2 = n * 3 - hyp(p.x - sx, p.y - sy) / 400;
                        if (sc2 > bS) { bS = sc2; stand = { sx, sy, ldx, ldy, line: n }; }
                    }
                }
                if (stand) Object.assign(flameTarget, stand);
            }
            // v6.93.3: while any passout is in aim range it is the ONLY
            // target class (the old 3 vs 2.5/2/1 weights let a close boss
            // outbid a farther passout through the falloff). Mobs, walls and
            // bosses get the burn only when no passout exists to spend it on:
            // the burn is already lit at that point, so sweeping the crowd
            // costs nothing.
            if (!flameTarget)
                for (const e of th.enemies) consider(e.x, e.y, e.wall ? 2.5 : (e.boss ? 2 : 1));
        }

        // v6.89.6/7 THE KITE WEIGHT, hoisted: every factor here is constant
        // across the candidate sweep, and it now has two arms.
        //
        // The SWEEP (the conga line dragged through the burn) is damped by
        // everything that wants the bot to hold still — anchor, corner, build
        // completeness, pause.
        //
        // The SPACING step is not: it is only ever armed with a body already
        // inside the band, and a 0.12x corner factor would crush the one
        // sidestep that prevents a contact death.
        //
        // v6.89.7 CAPS the spacing arm instead of trusting a default. 6.89.6
        // claimed the corner outbids it — "cornerPull 4.0 * 0.5 = 2.0 against
        // kitePull 2.0 * 0.6 = 1.2" — but `movement.kitePull` is IN THE CEM BOX
        // (min 0.5, max 4.0) and a live read caught it at 2.223 and climbing.
        // At the box ceiling the spacing arm reaches 2.4 and beats the corner,
        // so the invariant would silently invert mid-run while the unit test,
        // which reads the static default, passed forever. The margin is now
        // enforced against the corner's ACTUAL weight, every tick.
        const kiteBaseW = M.kitePull * charOf().kiteMul * (zoner ? 1.6 : 1) *
            (knocker && th.boss ? 1.25 : 1) * (rainbowRecent ? 1.4 : 1) *
            (flight ? (grind ? M.grindKiteMul : 1.8) : 1);
        let kiteW;
        if (kiteSpacing) {
            const ceil = (CONFIG.deepHell.cornerPull || 4) * 0.5 *
                (CONFIG.deepHell.spacingCeilShare != null ? CONFIG.deepHell.spacingCeilShare : 0.6);
            kiteW = Math.min(kiteBaseW * (M.kiteSpacingMul != null ? M.kiteSpacingMul : 0.6), ceil);
        } else {
            // v6.89.3: cornered means STOP sweeping — the two pulls fight, and
            // the corner is the one that keeps the bot alive.
            kiteW = kiteBaseW * (anchor ? 0.35 : 1) * (cornerOn ? 0.12 : 1) * kiteDamp *
                (farmRef.v ? 0 : 1);   // v6.95.0: the farm stance grinds, it does not sweep — with danger discounted
                                       // to near zero a DAMPED sweep still beats standing still, so it is OFF outright.
                                       // The kiteSpacing sidestep arm (other branch) keeps full weight, and an HP drop
                                       // exits the stance and restores the sweep.
        }

        // =================================================================
        // v6.107.0 THE DROP ANCHOR (user)
        // =================================================================
        // "maintain some sort of anchor even if there's danger, because if
        //  you kill a rushing mob with powerful weapons, you can pick up
        //  lucky items like time pause, flame cross, or tequila shots."
        //
        // This was structurally absent, and the absence was self-concealing.
        // `gatherLoot` values pickups that ALREADY EXIST on the floor. A pack
        // that has not died yet has dropped nothing, so it registers as pure
        // danger; the field pushes the bot off it; the pack never dies; the
        // drops never spawn; and no evidence of the missed value is ever
        // produced. The CEM could not learn its way out of that because there
        // was no gradient to climb — nothing in the planner represented the
        // loot a killable pack is ABOUT to become.
        //
        // The anchor is that representation: a pull toward the centre of a
        // pack the bot can actually clear, competing against the danger field
        // on the same terms as every other gain.
        //
        // DELIBERATELY A GAIN, NOT A DANGER DISCOUNT. Suppressing fear while
        // "anchored" would also suppress mark, line and projectile fear —
        // the three things that actually end runs — and this project has a
        // long file of regressions from exactly that kind of blanket
        // multiplier (6.85.22's enemy-type ratchet being the worst). Holding
        // ground through danger emerges when anchorValue is high enough to
        // outbid the fear, and the CEM decides how high that is. The box
        // opens at ZERO on purpose: if the idea does not pay, the search can
        // switch it off entirely and say so.
        //
        // FEASIBILITY IS THE WHOLE GATE. "Killable" is measured, not assumed:
        // the pack must be clearable inside anchorTtkS at the kill rate this
        // run is actually achieving. A bot with no weapons standing in a
        // crowd is how runs end, so with killRate at 0 the anchor never arms.
        let anchorOn = false, anchorX = 0, anchorY = 0, anchorN = 0, anchorTtk = null;
        if (!hpPanic && !th.rival && !wallFocus && (M.anchorValue || 0) > 0 &&
            hpRatio > (M.anchorMinHp != null ? M.anchorMinHp : 0.55)) {
            let sx = 0, sy = 0, n = 0;
            for (const e of th.enemies) {
                if (e.wall || e.boss || e.dormant || e.distant) continue;
                if (hyp(e.x - p.x, e.y - p.y) > (M.anchorRange != null ? M.anchorRange : 190)) continue;
                sx += e.x; sy += e.y; n++;
            }
            // killRate is kills/second (rolling), so pack size over kill rate
            // is seconds-to-clear in the units the tracker actually produces.
            if (n >= (M.anchorMinPack != null ? M.anchorMinPack : 3) && killRate > 0.05) {
                const ttk = n / killRate;
                if (ttk <= (M.anchorTtkS != null ? M.anchorTtkS : 5)) {
                    anchorOn = true; anchorX = sx / n; anchorY = sy / n;
                    anchorN = n; anchorTtk = ttk;
                }
            }
        }
        if (anchorOn) { dropAnchorTicks++; dropAnchorLastGt = typeof G.gameTime === 'number' ? G.gameTime : 0; }

        // v6.125.0 THE PLANNER'S CPU BILL — PART 3 OF 4: EVERYTHING BELOW IS
        // CANDIDATE-INVARIANT AND WAS RECOMPUTED ONCE PER CANDIDATE.
        //
        // The candidate scan runs 33 times a tick and these values do not
        // depend on the candidate at all. `charOf()` is a hash lookup with a
        // fallback string, `ownedLevels[...]` two more, and `auraD0` a full
        // 260-enemy distance pass (8580 wasted square roots per tick) — the
        // aura term reads d0e only to decide membership and to subtract d1e
        // from, and BOTH the membership test and d0e itself are fixed for the
        // whole tick. Precomputing changes no arithmetic: the same numbers
        // reach the same terms, computed once instead of thirty-three times.
        const CH = charOf();
        const chPierce = CH.pierce || 0;
        const chBossFloor = CH.bossFloor || 0;
        const chDayRing = CH.dayRing;
        const chUltReach = CH.ultReach || 156;
        const wallRanged = (ownedLevels['MOJITO'] || 0) >= 3 || (ownedLevels['VODKA MARTINI'] || 0) >= 3;
        // th.enemies within the aura's 2.2x reach, with their CURRENT distance
        // already taken. Built only when the term can actually fire.
        let auraE = null, auraD0 = null;
        if (auraUlt) {
            auraE = []; auraD0 = [];
            const lim = chUltReach * 2.2;
            for (const e of th.enemies) {
                const d0e = hyp(p.x - e.x, p.y - e.y);
                if (d0e < lim) { auraE.push(e); auraD0.push(d0e); }
            }
        }

        // v6.126.0 THE PLANNER'S CPU BILL — PART 4: THE SWARM. Measured on a
        // realistic deep-hell scene (219 enemies inside enemyRange pressing
        // on the corner seat, the field the census reports at 256): planMove
        // cost 4.07 ms per tick after 6.125.0 — 1.85 cores at speed 15 — and
        // 78 % of it was the candidate scan, split between the nearest-live
        // pass (17 %) and the danger field (30 %). Both walked every in-range
        // enemy for every one of the 33 candidates, and in a swarm almost
        // none of those enemies can change the answer:
        //
        //   * every candidate lies within `step` (~38 px) of the player, so
        //     an enemy's distance to ANY candidate is within ±step of its
        //     distance to the player, computed once;
        //   * the danger field adds exactly 0 for an enemy whose distance
        //     exceeds max(r + cpad, reach, r + step) — every branch below is
        //     gated on `d <` one of those — so an enemy further than that
        //     plus `step` from the player contributes to NO candidate;
        //   * the nearest-live pass wants a strict minimum, so an enemy whose
        //     player-distance exceeds the best player-distance by more than
        //     2·step can never be nearest to any candidate.
        //
        // The culls below are EXACT, not approximate: an enemy is dropped
        // only when the original arithmetic would have produced zero (or
        // lost the minimum) for every candidate, with a 1 px / 0.01 % margin
        // so floating-point rounding at a boundary can never flip a branch —
        // anything inside the margin still runs the original comparisons.
        // tools/plan-diff.js holds the differential proof: 4,320 plans across
        // day/hell × three characters × swarm/uniform scenes, identical to
        // 1e-9 against 6.124.0.
        //
        // The predicted position (fx, fy) and per-enemy cutoff are also
        // candidate-invariant and were recomputed 33× per enemy per tick.
        // Everything the danger loop needs per enemy, precomputed into flat
        // typed arrays (pooled at module scope, grown on demand — no per-tick
        // allocation): predicted position, squared cutoff, radius, the
        // contact-band width, the (depth-scaled) reach, and the three
        // coefficients each branch multiplies by. Per-enemy constants that
        // used to be re-derived 33x per tick from `e.*`, `DH.*`, `T.*` and a
        // four-deep CONFIG chain are now one Float64Array read each. The
        // reach coefficient folds the five trailing factors of the original
        // product; the result differs from the original only at the ulp
        // level, which tools/plan-diff.js bounds at 1e-9 across 4,320 plans.
        //   dKind: 0 = common, 1 = wall, 2 = boss or rival
        let dN = 0;
        {
            const bossPad = 1 + (DH.bossPadMul - 1) * depth;
            const bossReach = 1 + (DH.reachMul - 1) * depth;
            const ewc = T.enemyWeight * caution;
            const farmBossMul = CONFIG.movement.farmBossFearMul != null ? CONFIG.movement.farmBossFearMul : 0.7;
            const need = th.field.length;
            if (DPOOL.fx.length < need) dpoolGrow(need);
            const fld = th.field;
            for (let i = 0; i < fld.length; i++) {
                const e = fld[i];
                if (stopBoss && e.frozen && e.frozenLeft >= 45 && e.boss && !e.wall) continue;   // the loop's own skip, hoisted
                const fx = e.x + e.vx * stepFrames, fy = e.y + e.vy * stepFrames;
                const r = e.r;
                let cut, kind, cpad = 0, reachD = 0, kc = 0, kp = 0, kt = 0, kr = 0;
                if (e.wall) { kind = 1; cut = Math.max(r + 26, r + 10 + step); }
                else {
                    const br = !!(e.boss || e.rival);
                    kind = br ? 2 : 0;
                    const deepBand = br ? bossPad : 1;
                    cpad = (e.rival ? 40 : (e.boss ? (e.chaserFast ? 40 : 24) : 10)) * deepBand;
                    reachD = e.reach * ((e.boss && !e.wall) ? bossReach : 1);
                    cut = Math.max(r + cpad, reachD, br ? r + step : 0);
                    kc = (e.rival ? 90 : 40) * e.w * caution;
                    kp = (e.rival ? 45 : (e.boss ? 26 : 10)) * e.w * caution;
                    kt = 40 * e.w * caution;
                    kr = ewc * e.w * 6 * (e.stationary ? 0.45 : 1) * ((e.boss && !e.stationary) ? 1.25 : 1) *
                        ((anchor && !e.boss && !e.rival) ? 0.65 : 1) *
                        ((farmRef.v && e.boss && !e.rival) ? farmBossMul : 1);
                }
                if (hyp(p.x - fx, p.y - fy) >= cut + step + 1) continue;   // zero for every candidate
                const k = dN++;
                DPOOL.fx[k] = fx; DPOOL.fy[k] = fy; DPOOL.c2[k] = (cut + 1) * (cut + 1); DPOOL.r[k] = r;
                DPOOL.kind[k] = kind; DPOOL.cpad[k] = cpad; DPOOL.reach[k] = reachD;
                DPOOL.kc[k] = kc; DPOOL.kp[k] = kp; DPOOL.kt[k] = kt; DPOOL.kr[k] = kr;
            }
        }
        const dFX = DPOOL.fx, dFY = DPOOL.fy, dC2 = DPOOL.c2, dR = DPOOL.r, dKind = DPOOL.kind,
              dCpad = DPOOL.cpad, dReach = DPOOL.reach, dKc = DPOOL.kc, dKp = DPOOL.kp, dKt = DPOOL.kt, dKr = DPOOL.kr;
        // The nearest-live body is consumed by exactly one term — joe's
        // pierce alignment, gated on `chPierce >= 4 && th.passouts.length`
        // (candNearestLive/candNearestE are read nowhere else; the 6.93.0
        // audit already flagged the former as write-only). When that gate is
        // shut the pass is pure waste, so it is not run at all.
        const wantNearest = chPierce >= 4 && th.passouts.length > 0;
        let nearE = wantNearest ? th.live : [];
        if (wantNearest && nearE.length > 8) {
            let minP = Infinity;
            const dP = new Array(nearE.length);
            for (let k = 0; k < nearE.length; k++) {
                const e = nearE[k];
                const v = hyp(p.x - e.x, p.y - e.y) - (e.r || 0);
                dP[k] = v; if (v < minP) minP = v;
            }
            const lim = minP + 2 * step + 1;
            const keep = [];
            for (let k = 0; k < nearE.length; k++) if (dP[k] <= lim) keep.push(nearE[k]);
            nearE = keep;
        }
        // Flat coordinates for the two hot passes: one Float64Array read per
        // field instead of a property load through a polymorphic object.
        const nearN = nearE.length, nearX = new Float64Array(nearN), nearY = new Float64Array(nearN), nearR = new Float64Array(nearN);
        for (let k = 0; k < nearN; k++) { const e = nearE[k]; nearX[k] = e.x; nearY[k] = e.y; nearR[k] = e.r || 0; }

        let best = null;
        const N = M.samples;
        // v6.126.0: the loop is scoreCandidates() — see THE OPTIMIZER CEILING.
        {
            const SC = scoreCandidates({
                DH, M, N, T, anchor, anchorOn, anchorX, anchorY, auraD0, auraE, auraUlt, chBossFloor,
                chDayRing, chPierce, cnrX, cnrY, cornerOn, crOnly, crOnlyW, cx, cy, dN, dayFarm, dayPhaseNow,
                depth, escape, fh, flameOn, flameTarget, flight, fw, grind, gtDeepP, gtNow2, hellMul,
                hellRecent, hpPanic, hpRatio, kite, kiteW, knocker, loot, lootMul, markHere, markW, nearE,
                nearN, nearR, nearX, nearY, p, panic, poCx, poCy, poN, projDt, projHere, projW,
                rainbowRecent, slowPad, standoffAdj, step, stopBoss, stopStation, th, trekPo, ultFall,
                ultHarvest, wallFocus, wallRanged, zoner
            });
            best = SC.best; poTtkOut = SC.poTtkOut; poDpsOut = SC.poDpsOut;
        }

        if (!best) return null;

        // Smooth in UN-normalised space. Normalising the blend would create a
        // fixed point: a reversal that cancels to a tiny residual would be
        // re-inflated to full strength in the old direction and never flip.
        const s = M.smoothing;
        smoothVec = {
            x: smoothVec.x * s + best.dx * (1 - s),
            y: smoothVec.y * s + best.dy * (1 - s)
        };
        const mag = hyp(smoothVec.x, smoothVec.y);
        let vx, vy;
        if (mag > 0.02) { vx = smoothVec.x / mag; vy = smoothVec.y / mag; }
        else { vx = best.dx; vy = best.dy; }   // mid-reversal: commit to the new heading
        // v6.95.0: normalisation turns a DECAYING residual into full-speed
        // drift — a chosen stand-still keeps walking the old heading for ~9
        // ticks until the residual crosses 0.02. In the farm stance that
        // drift IS the empty-field bug (the bot glides out of the crowd it
        // decided to grind), so a chosen stand-still stands NOW.
        if (farmRef.v && best.dx === 0 && best.dy === 0) {
            smoothVec.x = 0; smoothVec.y = 0; vx = 0; vy = 0;
        }

        // ================== v6.90.0 DEEP PARK ==================
        // The measured A/B, not a model. Bot ON: median run 22 minutes. Bot
        // OFF, player parked in a corner at 258 enemies: 309/309 -> 306/309
        // across 155 seconds, still going at 125 minutes. A player doing
        // NOTHING outlives the bot by a factor of five.
        //
        // Sixty versions have tuned kiting, standoff, escape, flee, loot pulls
        // and boss engagement. At depth the correct value of all of them is
        // zero: they are what carries the bot out of the only stable position
        // on the board. This does not re-weight them — it overrides them, which
        // is the only faithful implementation of "what the stopped bot did".
        //
        // Walk to the corner; on arrival, STOP. Two exceptions, both handed
        // straight back to the normal planner:
        //   markHere      — a drop-mark overlapping us is the one thing worth
        //                   moving for, and the corner is otherwise geometrically
        //                   mark-immune (80.9 px against a 70 px reach).
        //   lineOnCorner  — a charge lane is an unbounded RAY; no point in the
        //                   arena is outside it, so the corner cannot defeat it.
        const DHp = CONFIG.deepHell;
        // v6.91.2: gated on the LIVE stats. The old keys read 1 at the defense
        // cap, so park could never engage. Measured live: def 34.992, regen 2.218.
        const parkDef = liveDefense();
        const parkArmor = (parkDef != null)
            ? parkDef >= (DHp.parkDefense != null ? DHp.parkDefense : 30)
            : (ownedLevels['OLIVE'] || 0) >= (DHp.parkOliveLv || 6);
        // v6.112.0: the seat now requires regen that actually out-heals the
        // contact the seat will take, not a flat 1.0 that sits below it.
        const parkRegenFlat = DHp.parkRegenRate != null ? DHp.parkRegenRate : 1.0;
        const parkBE = contactBreakEven();   // null = armour unreadable: no opinion
        const parkRegenNeed = parkBE == null ? parkRegenFlat : Math.max(parkRegenFlat,
            parkBE * (DHp.parkRegenBreakEven != null ? DHp.parkRegenBreakEven : 0));
        const parkRegen = regenRate() >= parkRegenNeed;
        // v6.90.1 adds the OFFENSIVE half of the equilibrium. A parked player
        // survives because two things are true at once: armor and regen absorb
        // what arrives, AND the auto-attack plus the SOUTH SIDE burn clear the
        // swarm that gathers on the seat. With only the first half the bodies
        // accumulate and the seat stops being safe — which is the real risk of
        // parking early, when the offensive build is still thin.
        const parkClear = zoner;   // SOUTH SIDE owned, or its super made
        // v6.91.4 THE YIELD HAD TO BE BOUNDED, and the user's own description is
        // why: WHISKY SOUR "just freezes the bosses always". 6.91.1 released park
        // for ANY frozen boss, so a build carrying a permanent boss freeze would
        // have suspended park for the whole run — silently undoing 6.91.2 and
        // 6.91.3 for exactly the builds this version is meant to encourage.
        //
        // A boss that has been frozen for two minutes is not an opportunity, it
        // is the background state. So the yield is ONE burn window per freeze
        // episode, keyed on the boss id: take `parkYieldS` seconds at the
        // stacking station, then go home and stay there until a different boss
        // freezes. Keyed on `stopBoss` rather than `frozenBossHere` so park
        // releases exactly when the tuned station will actually take the heading
        // (hell + zoner + no live projectile + >= 45 frames left) and not
        // otherwise.
        const frozStation = stopBoss;
        let parkYieldFrozen = false;
        if (frozStation) {
            const fid = frozStation.id != null ? frozStation.id : 'anon';
            if (parkYieldId !== fid) {
                // v6.117.0: bank the window that just ended before starting the
                // next one, so the run budget counts what was actually spent
                // rather than the number of episodes.
                if (parkYieldId !== null) {
                    parkYieldSpentS += Math.min(
                        CONFIG.deepHell.parkYieldS != null ? CONFIG.deepHell.parkYieldS : 20,
                        Math.max(0, gtCorner - parkYieldAt));
                }
                parkYieldId = fid; parkYieldAt = gtCorner;
            }
            const yMax = CONFIG.deepHell.parkYieldRunMaxS;
            const spentNow = parkYieldSpentS + Math.min(
                CONFIG.deepHell.parkYieldS != null ? CONFIG.deepHell.parkYieldS : 20,
                Math.max(0, gtCorner - parkYieldAt));
            parkYieldFrozen = (gtCorner - parkYieldAt) <= (CONFIG.deepHell.parkYieldS != null ? CONFIG.deepHell.parkYieldS : 20) &&
                (yMax == null || spentNow <= yMax);
        } else {
            if (parkYieldId !== null) {
                parkYieldSpentS += Math.min(
                    CONFIG.deepHell.parkYieldS != null ? CONFIG.deepHell.parkYieldS : 20,
                    Math.max(0, gtCorner - parkYieldAt));
            }
            parkYieldId = null; parkYieldAt = 0;
        }
        // v6.91.1: park yields to a FROZEN boss, the same exception the corner
        // has carried since 6.89.8 — "a free kill is worth leaving the funnel
        // for at any depth". Park shipped in 6.90.0 without it and has been
        // zeroing movement over the top of the stacking station ever since.
        // Releasing park hands the heading back to that station rather than to
        // a new one, so the tuned two-phase ring keeps doing the work.
        const parkOn = DHp.park !== false && hellDetected && parkArmor && parkRegen && parkClear &&
            gtCorner > (DHp.parkFromS != null ? DHp.parkFromS : 1200) &&
            !markHere && !lineOnCorner && !parkYieldFrozen;
        let parked = false, onPost = false, harvesting = false, trekking = false, seated = false;
        // v6.95.2 ENTRY SEAT — see the config comment. Below hunt and park in
        // precedence (park with its gates passed IS the seat, better armed);
        // above harvest/trek, which must not yank the bot to a pile while the
        // entry surge is queueing.
        const gtSeatW = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const seatWindow = CONFIG.deepHell.entrySeat !== false && (
            (!hellDetected && gtSeatW >= (CONFIG.deepHell.entryPrepS != null ? CONFIG.deepHell.entryPrepS : 1140) &&
                              gtSeatW < (CONFIG.deepHell.entryDayMaxS != null ? CONFIG.deepHell.entryDayMaxS : 1320)) ||
            (hellDetected && gtSeatW < (CONFIG.deepHell.entrySeatUntilS != null ? CONFIG.deepHell.entrySeatUntilS : 1290)));
        const seatOn = seatWindow && !markHere && !lineOnCorner && !flight && !th.rival && hpRatio > 0.4;
        // v6.94.0 DAY TREK (override form of v6.85.10's FIELD TREK — see the
        // config comment). Selection runs here so it can see the same gather;
        // trekPo (the old pull's target) stays as the passout candidate.
        let trekT = null, trekOn = false;
        {
            const MH2 = CONFIG.movement;
            const gtT = typeof G.gameTime === 'number' ? G.gameTime : 0;
            const relPx = MH2.trekReleasePx != null ? MH2.trekReleasePx : 190;
            const apDefT = charOf().approachDefense, apHpT = charOf().approachHp;
            const trekGates = MH2.trekOverride !== false && !hellDetected && gtT < 1200 &&
                // v6.99.2: the trek keeps its OWN floor — farmFromS 45 is for
                // the local pile walk; crossing the field in minute one was
                // the 64-82 s death cluster (see config trekFromS).
                gtT >= (MH2.trekFromS != null ? MH2.trekFromS : 150) &&
                // v6.99.1: the fund-rush waiver extends to the trek — the
                // demo's "full kill of day bosses including passouts" crossed
                // the field armor-less; with the ult ready the cast covers
                // the destination. HP gate below stays; v6.99.2: the waiver
                // expires with the rush at entryPrepFromS.
                (apDefT == null || ((liveDefense() || 0) >= apDefT) ||
                 ((MH2.fundRush !== false) && ultReadyNow &&
                  gtT < (MH2.entryPrepFromS != null ? MH2.entryPrepFromS : 1050))) &&
                (apHpT == null || hpRatio >= apHpT) &&   // v6.95.1 fragile profile
                !hpPanic && !th.rival && !rainbowRecent && !flight;
            if (trekGates) {
                // v6.94.1 (user): in the EARLY game the first-landed passouts
                // outrank everything — their HP is priced at landing time, so
                // they are the only bodies the early roster can actually
                // convert to loot, and that loot is what makes the NEXT set
                // killable. Before trekPoFirstS the FIFO passout leads; after
                // it, the boss tip (a roster upgrade) resumes the lead.
                // v6.99.1 LITTER HUNT (user: "it needs to kill the feed
                // filler boss fast so it doesn't crowd the canvas with
                // marks"): when the litter carpet is forming, the live boss
                // producing it outranks even the early passout FIFO — the
                // boss scan below takes the lead and the po falls to the
                // FIFO fallback. Kill the source, then farm the piles.
                const litterHunt = litterN >= (MH2.litterHuntN != null ? MH2.litterHuntN : 4);
                const poFirst = gtT < (MH2.trekPoFirstS != null ? MH2.trekPoFirstS : 600) && !litterHunt;
                let cand = null, kind = null, bestD = Infinity;
                if (poFirst && trekPo) { cand = trekPo; kind = 'po'; }
                // roaming boss, unless one is already local — the tip is
                // the highest-leverage loot in the game.
                if (!kind) {
                    let localBoss = false; bestD = Infinity;
                    for (const e of th.enemies) {
                        if (!e.boss || e.wall || e.frozen) continue;
                        const dB = hyp(e.x - p.x, e.y - p.y);
                        if (dB < relPx) { localBoss = true; cand = null; break; }
                        if (dB < bestD) { bestD = dB; cand = e; }
                    }
                    if (cand) kind = 'boss';
                }
                // the FIFO passout trek (already gated on an empty local
                // pile by the trekPo selection above)
                if (!kind && trekPo) { cand = trekPo; kind = 'po'; }
                // 3) a wall cluster, if no wall is already local. Distant
                //    walls never reach th.enemies (the gather range-caps
                //    non-boss bodies), so scan the RAW list the way the
                //    passout gather does.
                if (!kind && !wallFocus) {
                    cand = null; bestD = Infinity;
                    const raw = safe(() => enemies, null) || [];
                    for (const e of raw) {
                        if (!e || typeof e.x !== 'number') continue;
                        const isW = e.wall === true || /nobook/i.test(String(e.bossChar || '') + ' ' + String(e.type || ''));
                        if (!isW || e.contested) continue;
                        const dW = hyp(e.x - p.x, e.y - p.y);
                        if (dW >= relPx && dW < bestD) { bestD = dW; cand = e; }
                    }
                    if (cand) kind = 'wall';
                }
                if (kind) trekT = { x: cand.x, y: cand.y, kind };
            }
            if (!trekT) {
                trekStartS = null;
            } else if (gtT >= trekRestUntilS) {
                if (trekStartS == null || trekStartS > gtT) trekStartS = gtT;
                if (gtT - trekStartS <= (MH2.trekS != null ? MH2.trekS : 12)) {
                    trekOn = true;
                } else {
                    trekStartS = null;
                    // v6.99.1 (user: "need to get tips faster and not let it
                    // stick around wasting time for upgrades"): in day the
                    // rest between treks is dead income time — the next tip
                    // is already on the field. Rest clocks shrink by
                    // dayRestMul; hell keeps the full anti-deadlock rest.
                    trekRestUntilS = gtT + (MH2.trekRestS != null ? MH2.trekRestS : 20) *
                        (!hellDetected ? (MH2.dayRestMul != null ? MH2.dayRestMul : 0.4) : 1);
                }
            }
        }
        // v6.93.1 HARVEST APPROACH (user: "Joe and Pat still can't clear
        // passouts for fast rewards... minguk seems to be able to clear 120
        // minutes with consistency"). Minguk needs no walk — his nuke is
        // field-wide. Pat's spiral and joe's aura only pay ADJACENT, and the
        // adjacency was left to chance: ultHarvest existed only as a pull,
        // which the crowd's repulsion outbids precisely where a passout is
        // worth ulting (fireBase can't shoot it because mobs are nearer —
        // meaning mobs ARE near). So in the early window the approach is an
        // override: walk to the weighted pile centroid, stop at casting
        // range, let the 06 adjacency triggers spend the ult. Both melee
        // ults are invulnerability windows, so the cast covers the exit.
        // Time-boxed like the hunt so an unreachable pile cannot deadlock.
        const MH = CONFIG.movement;
        const gtHarv = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const harvWindow = !hellDetected || gtHarv < (MH.harvestUntilS != null ? MH.harvestUntilS : 2700);
        // NOTE the missing lower bound: arrival must HOLD, not release. The
        // demo human stands on the pile as the ult comes off cooldown; if the
        // override let go at the stop radius, the repulsion field would shove
        // the bot back out before the 900ms ult retry fires. The 12s clock is
        // what bounds the hold, and the cast itself ends it (the cooldown
        // resets ultInS past ultHarvestLeadS, dropping ultHarvest).
        // v6.93.3: an ACTIVE burn is walked to the pile the same way — the
        // cross fires along the aim vector for only ~5s, and a burn spent
        // circling mobs is the waste the user named. Same gates as ultHarvest
        // (the flame arm re-states them: !hpPanic/!markHere/!projHere), same
        // clock, any character — the cross is not a melee ult, so the
        // meleeUlt gate applies only to the ult arm.
        const flameHarvest = flameOn && !hpPanic && (!markHere || markSoak) && !projHere;
        // v6.94.0 FARM READINESS: the 6.93.2+joe row (median 167s, deaths at
        // 72s with no cocktail yet) says approach overrides before the run
        // has legs are suicide walks. Applies to harvest AND trek.
        // v6.94.1 (user): "they need to kill the passouts that landed first
        // as soon as possible to have the potential for loot and weapon and
        // ingredient upgrades to kill the next set of passouts." Passout HP
        // scales with LANDING time, so every second of delay prices the
        // first bodies up — the flat 150s gate was fighting the snowball.
        // The real suicide marker in the joe row was BUILD NULL (no weapon
        // at 72s), so the gate is now the weapon itself, plus a short floor.
        // v6.95.1 fragile profile (joe): a character with no regen treats
        // every approach as a purchase HP cannot refund. Approaches need
        // MEASURED armor at the 4-OLIVE floor and healthy HP; others unset.
        // v6.99.0 ULT-COVERED WAIVER (manual joe demo, 6.98.0, 1997s, day
        // cleared): the human stationed 91px off the piles from the FIRST
        // landings — first ult wiped 3 passouts at gt 155 while OLIVE did
        // not arrive until gt 285 — and spent 0.326 of the run invulnerable.
        // The armor the defense gate waits for IS the ult: the cast covers
        // the exit. The ult arm of the approach (`meleeUlt && ultHarvest`)
        // is by construction ult-covered (ultReadyNow || ultInS <= leadS),
        // so it needs only healthy HP; MEASURED armor stays required for
        // the flame arm here and for the field trek above, which have no
        // invulnerability window to hide in.
        const apDefH = charOf().approachDefense, apHpH = charOf().approachHp;
        const defOkH = (apDefH == null || ((liveDefense() || 0) >= apDefH));
        const fragileOk = (apHpH == null || hpRatio >= apHpH);
        const farmReady = ownedCocktailCount() >= 1 && fragileOk &&
            gtHarv >= (MH.farmFromS != null ? MH.farmFromS : 90);
        // v6.99.1 AURA HOLD (user: "the ultimate has a fixed radius so the
        // bot has to stick to its position to wipe out the passouts instead
        // of just damaging them to a low hp and not actually killing them to
        // get the tips"). The cast used to END the hold: the cooldown reset
        // pushed ultInS past the lead window, ultHarvest dropped, and the
        // repulsion field shoved the bot off the pile while the aura (joe:
        // ~12 s) or spiral (pat) was still ticking — bodies left at low HP,
        // tips unrolled. While the melee ult is ACTIVE and a pile is up, the
        // hold arm keeps the override pinned to the centroid; the invuln
        // makes every caution veto moot for exactly that window.
        const ultBurnHold = meleeUlt && ultInvuln && poN >= 1;
        // v6.99.2: the ult arm's armor waiver is the FUND RUSH's, not
        // structural — 6.99.0 had removed defOkH from this arm outright, so
        // "the rush stands down at entryPrepFromS" restored nothing. Now the
        // unarmored ult-covered walk exists exactly where the rush does
        // (day, before entry prep, healthy); everywhere else — late day,
        // entry, hell — the v6.95.1 armor discipline is back.
        const harvWant = MH.harvestApproach !== false && harvWindow && farmReady &&
            ((meleeUlt && ultHarvest && (defOkH || fundRush)) || (flameHarvest && defOkH) || ultBurnHold) &&
            poN >= 1 && poNearest != null &&
            poNearest <= (MH.harvestRangePx || 300) &&
            !flight && !th.rival;
        let harvOn = false;
        if (!harvWant) {
            harvStartS = null;
        } else if (gtHarv >= harvRestUntilS) {
            if (harvStartS == null || harvStartS > gtHarv) harvStartS = gtHarv;
            if (gtHarv - harvStartS <= (MH.harvestS != null ? MH.harvestS : 12)) {
                harvOn = true;
            } else {
                harvStartS = null;
                // v6.99.1: same day rest cut as the trek — see above.
                harvRestUntilS = gtHarv + (MH.harvestRestS != null ? MH.harvestRestS : 20) *
                    (!hellDetected ? (MH.dayRestMul != null ? MH.dayRestMul : 0.4) : 1);
            }
        }
        // v6.96.0 THE RUN CAP DIVE (see the runCapS config comment). Past the
        // cap the run's one remaining job is to END so it books. The dive is
        // the top of the override chain on purpose: park and seat are the
        // overrides that MAKE the build immortal, so anything below them
        // would sit in the corner forever. Straight at the nearest live
        // body, no stop radius, no panic, no escape — the candidate loop's
        // whole output is overwritten, which is the same mechanism (and the
        // same reason) as park itself: a pull competing with gain terms
        // moves nothing; an override moves everything.
        const gtCap = typeof G.gameTime === 'number' ? G.gameTime : 0;
        // v6.99.3 EARLY CAP (user: "the auto-kill protocol to continue
        // learning more data if setup is complete and HP and armor and
        // weapons and ingredients are stable enough to survive corner
        // anchoring"). The stability PROOF, not a guess: from capStable.fromS
        // on, hp must hold >= hpFloor for holdS consecutive game-seconds
        // with the seat armor (defMin, the parkAudit bar) and supersMin
        // banked. Any dip resets the clock. Once proven, capEarly LATCHES —
        // the patrol drains HP by design and must not disengage itself.
        // No hellDetected guard needed: day ends at ~1320 s, so fromS 3600
        // is unreachable outside a hell run.
        {
            const CS = DHp.capStable || {};
            // v6.102.0: the proof now RUNS from gt 0 and `fromS` gates only
            // the LATCH. Two reasons. (1) It makes the bot answer the user's
            // question — "when should the kill protocol mark the build
            // complete?" — instead of us guessing: capReadyGt records the gt
            // the build first met its armour and supers bars, and the phase
            // row carries it, so medianReadyAt in the funnel sets fromS from
            // data. (2) A build that was ready at 1400 s used to start its
            // 300 s hold at 3600 and latch at 3900; now the hold has already
            // run for 2200 continuous seconds when 3600 arrives, so it
            // latches AT the floor on a far stronger proof than the old one.
            if (!capEarly && (CS.holdS || 0) > 0) {
                const hpFloor = CS.hpFloor != null ? CS.hpFloor : 0.97;
                const defMin = CS.defMin != null ? CS.defMin : 35;
                const defNow = liveDefense() || 0;
                // v6.132.0: the third leg is the BUILD, not the super count.
                // `supersMin` stays honoured only if a config still carries it,
                // so an older stored config cannot silently open the gate.
                const bg = buildGateState();
                const supersMin = CS.supersMin != null ? CS.supersMin : 0;
                const supersNow = typeof supersThisRun === 'number' ? supersThisRun : 0;
                const hpOk = hpRatio >= hpFloor, defOk = defNow >= defMin;
                const supOk = bg.ok && supersNow >= supersMin;
                const stableNow = hpOk && defOk && supOk;
                // v6.102.0 BUILD COMPLETE, measured. The armour and supers
                // bars are the BUILD; hp is the proof that the build holds.
                // Recorded once per run, whatever happens afterwards, and
                // independent of fromS — this is the datum fromS should be
                // set from.
                if (defOk && supOk && capReadyGt == null) capReadyGt = gtCap;
                if (stableNow) {
                    capDipSince = null;   // v6.100.1: back in the green — the grace clock stands down
                    if (capStableSince == null || capStableSince > gtCap) capStableSince = gtCap;
                    else {
                        const streak = gtCap - capStableSince;
                        if (streak > capBestStreakS) capBestStreakS = streak;
                        if (streak >= CS.holdS && gtCap >= (CS.fromS != null ? CS.fromS : 3600)) capEarly = true;
                    }
                } else {
                    // v6.132.0: name the leg AND, for the build leg, the clause
                    // that is short — "build:SIMPLE SYRUP" reads straight out
                    // of the report without a second probe.
                    const shortLeg = !hpOk ? 'hp' : !defOk ? 'def'
                        : !bg.ok ? ('build:' + ((bg.legs.filter(l => !l.ok)[0] || {}).need || '?')) : 'supers';
                    if (capStableSince != null) {
                        // v6.100.1 DIP GRACE (user: "not dying ... using dashes" —
                        // the old code zeroed the WHOLE hold on any instantaneous
                        // dip, which a contact-damage game trips constantly. A
                        // blip shorter than dipGraceS pauses the clock (streak
                        // keeps counting once we're back over the floor); a dip
                        // that outlasts the grace still resets fully, same as before.
                        const grace = CS.dipGraceS != null ? CS.dipGraceS : 0;
                        if (capDipSince == null) capDipSince = gtCap;
                        if (grace <= 0 || (gtCap - capDipSince) > grace) {
                            capStableSince = null; capDipSince = null;
                            capLastResetReason = shortLeg;
                        }
                    } else {
                        // v6.132.0: record the short leg even when NO streak was
                        // running. The old code only wrote this field on a reset,
                        // so a build that never once met its bars left it null —
                        // which is exactly the report the user pasted: streakS 0,
                        // nothing saying why. "Why has the clock never started"
                        // is the more common question, and now it has an answer.
                        capLastResetReason = shortLeg;
                    }
                }
            }
        }
        // =================================================================
        // v6.108.0 SATURATION — the third way to arm the cap, and the one
        // the measured stall actually needed.
        // =================================================================
        // A live probe of the run that would not end recorded, in all 18
        // samples: enemies pinned at 260-261 (the game's entity cap), HP
        // 1.00, ZERO drop marks, ZERO road lines, and pickups climbing
        // 79 -> 238 uncollected on the floor. That is not a build winning.
        // It is a deadlock: the bot cannot die and cannot clear, the page
        // has collapsed to 0.021x real time under the bodies it cannot
        // remove, and the run produces no information at any price.
        //
        // WHY NOT capStable. That proof asks what the BUILD looks like —
        // `stableNow = hpOk && defOk && supOk`, so the HP hold only
        // accumulates while the build gates also pass. Two of the three runs
        // that reached the 9000 s clock cap had 2 supers against
        // `supersMin: 3` and therefore banked ZERO seconds of proof while
        // demonstrably immortal. Saturation asks what the RUN is doing, and
        // needs no build gate at all: a build that is not finished cannot
        // hold the entity cap at full HP in the first place.
        //
        // THE HOLD IS IN WALL SECONDS, for the same reason the ladder's
        // escape is. Saturation IS a wall-clock phenomenon; a game-second
        // hold would take ~48x longer to satisfy exactly when it matters.
        const SAT = (CONFIG.deepHell && CONFIG.deepHell.saturation) || {};
        if (!capEarly && (SAT.enemyMin || 0) > 0) {
            // THE RAW FIELD, not `th.enemies` — gatherThreats drops anything
            // past `threat.enemyRange` (line ~211), so the gathered list is a
            // local neighbourhood and would never reach the entity cap. The
            // probe measured `enemies.length`, and that is the number that
            // describes the stall: 260 bodies ON THE MAP, most of them far
            // away and none of them dying.
            const enAll = G.enemies;
            const enN = Array.isArray(enAll) ? enAll.length : 0;
            if (enN > satPeakEn) satPeakEn = enN;
            const satNow = enN >= SAT.enemyMin &&
                hpRatio >= (SAT.hpFloor != null ? SAT.hpFloor : 0.97) &&
                gtCap >= (SAT.minGtS != null ? SAT.minGtS : 1800);
            if (satNow) {
                if (satSince == null) satSince = Date.now();
                else if ((Date.now() - satSince) / 1000 >= (SAT.holdWallS != null ? SAT.holdWallS : 60)) {
                    capEarly = true;
                    capLastResetReason = 'saturated';
                }
            } else satSince = null;   // any dip in either signal restarts the hold
        }
        const capDive = ((DHp.runCapS || 0) > 0 && gtCap >= DHp.runCapS) || capEarly;
        // v6.91.0: the hunt outranks the park. Park is the reason the bot could
        // not hunt at all — it zeroes movement, so a boss the gather now sees
        // would still be ignored. Ordering them here keeps both as overrides
        // and makes the precedence explicit rather than emergent.
        // v6.101.0: which rung of the cap ladder we are on. 0 = not capped.
        // 1 = smother, 2 = the game's own hurtPlayer, 3 = hard book + restart.
        // 06 actuates 2 and 3; see the capStandS config comment.
        let capStage = 0;
        if (capDive) {
            capFiredThisRun = true;   // v6.96.2: the phase audit books this run as a cap-out
            if (capFirstGt == null) capFirstGt = gtCap;   // v6.99.4: WHEN it engaged (early vs clock)
            if (capFirstWall === 0) capFirstWall = Date.now();
            const capEl = Math.max(0, gtCap - capFirstGt);
            // =============================================================
            // v6.108.0 THE WALL-CLOCK ESCAPE
            // =============================================================
            // MEASURED, and it is the whole reason this version exists. A
            // live probe of a saturated run (260 enemies pinned at the entity
            // cap, HP 1.00 in all 18 samples) recorded the page advancing
            // 0.021 GAME-seconds per WALL-second — 358 game-seconds across
            // 4.8 wall-HOURS, with a 10 s timer firing every ~1000 s.
            //
            // Both budgets below are GAME seconds, so at that rate:
            //     rung 1 (capStandS 15)   = 12 wall-MINUTES
            //     rung 3 (capForceS 120)  = 1.6 wall-HOURS
            // and `runCapS` 9000 from gt 4599 is another ~59 wall-hours. The
            // protocol was 50x slowed by the exact condition it exists to
            // escape, which is why a run that should have been booked in two
            // minutes sat there for a working day.
            //
            // THIS INVERTS 6.100.0 ON PURPOSE, and only here. That version
            // moved the ability clocks to game time because a wall-ms gate
            // drifts against game BALANCE — one ult ask per 200 game-seconds
            // at a frame multiplier. That reasoning is right for anything
            // affecting how the bot plays. The ladder is not balance: it is
            // "end this run in the real world", and the real world is exactly
            // what a game clock cannot see.
            //
            // MAX of the two, never a replacement. At healthy speed the game
            // budgets are the smaller ones and still govern (15 game-s beats
            // capStandWallS 45); under starvation the wall budgets arrive
            // first. So this changes nothing about a normal cap-out.
            const capWallS = (Date.now() - capFirstWall) / 1000;
            const gStage = capEl >= (DHp.capForceS != null ? DHp.capForceS : 240) ? 3
                         : capEl >= (DHp.capStandS != null ? DHp.capStandS : 150) ? 2 : 1;
            const wStage = capWallS >= (DHp.capForceWallS != null ? DHp.capForceWallS : 180) ? 3
                         : capWallS >= (DHp.capStandWallS != null ? DHp.capStandWallS : 45) ? 2 : 1;
            capStage = Math.max(gStage, wStage);
            // v6.96.2 THE PATROL (user, watching the live cap-out): "it just
            // needs to walk around the map and doesn't need to dash and it
            // will keep getting hit by the common projectile mobs." Both
            // dives were still guesses at what kills a maxed build — 6.96.0
            // walked at commons (37 minutes, contact bounced off), 6.96.1 at
            // bosses. The user's answer is the one the data already signed:
            // run 4589 (pat, 220 min) died to a PROJECTILE the moment it was
            // forced off the corner. So the cap now just walks the open map —
            // a five-point circuit through the centre and the four corner
            // regions — with the dash holstered alongside the ult (see 06),
            // and the ranged mobs' crossfire does the rest. No target, no
            // gather dependence: the patrol runs even on a tick that sees no
            // enemies at all.
            // v6.101.0 THE SMOTHER (replaces the 6.96.2 five-point patrol —
            // see the capStandS config comment for the measurement that
            // convicted it: 25,141 s and 22,800 s runs against a 9000 s cap).
            // The patrol's own waypoints were four CORNER regions, i.e. the
            // safest ground on the map — the same geometry park/seat is built
            // on. A tour of the safe spots never establishes the sustained
            // contact the kill depends on, and contact is the only damage a
            // maxed build cannot out-regen (~15.5 dps vs 1.71-3.07 HP/s).
            // So: walk ONTO the hardest-hitting body available and STAND
            // there. Bosses first (biggest contactDmg), else the live crowd's
            // centroid, else the middle of the field while the crowd arrives.
            // Once inside contact range the velocity goes to ZERO — no
            // evasion, no kiting, no dash, no ult. That is the user's own
            // instruction: "just get constant contact damage."
            // v6.103.0 THE CENTROID WAS EMPTY SPACE. 6.102.0 aimed the
            // smother at the crowd's centroid, and all six cap-outs then
            // needed rung 2 to die. The geometry says why: a crowd that has
            // surrounded the player has its centroid AT the player, so
            // "walk to the centroid" resolved to "you are already there",
            // the stop test passed at distance ~0, and the bot stood in a
            // hole in the middle of a ring taking no contact at all. A
            // centroid is not a body. Aim at an actual body — the nearest
            // one, boss preferred (biggest contactDmg) — so the stand always
            // resolves onto a hitbox.
            let capBoss = null, capBossD = Infinity, capNear = null, capNearD = Infinity;
            for (const e of th.enemies) {
                if (e.wall || e.dormant || e.distant) continue;
                const dB = hyp(e.x - p.x, e.y - p.y);
                if (dB < capNearD) { capNearD = dB; capNear = e; }
                if (e.boss && dB < capBossD) { capBossD = dB; capBoss = e; }
            }
            const capTgt = capBoss || capNear;
            let ctx2, cty2, ctR;
            if (capTgt) { ctx2 = capTgt.x; cty2 = capTgt.y; ctR = (capTgt.r || 12) + (p.r || 7.2); }
            else { ctx2 = fieldW * 0.5; cty2 = fieldH * 0.5; ctR = 0; }
            const dSm = hyp(ctx2 - p.x, cty2 - p.y);
            if (dSm <= Math.max(ctR, 6)) { vx = 0; vy = 0; }   // STAND IN IT
            else { vx = (ctx2 - p.x) / dSm; vy = (cty2 - p.y) / dSm; }
        } else if (laneEscape) {
            // v6.111.0 THE LANE OVERRIDE. Placed above hunt / park / seat /
            // harvest and below capDive alone, because an armed charge lane
            // outranks every seat on the board: 21% of 1247 deaths, and the
            // only posture that survives one is not being in it.
            //
            // The project has measured twice now (6.89.11's dormant-boss pull,
            // 6.107.0's drop anchor) that a preference competing inside the
            // gain sum does not move the bot — "a pull competing with a dozen
            // other gain terms moved the bot 127 px in 120 minutes". The lane
            // exit has to be the same kind of object as park and hunt: an
            // override that zeroes the argument, not a vote inside it.
            //
            // This does NOT replace the danger field's lane terms. Those still
            // price lanes for every ordinary step, which is what keeps the bot
            // from wandering into one; this fires only once it is already
            // standing in a band that is live or about to be.
            // v6.114.0: count the DIVERSIONS, not the firings. The first live
            // report came back with laneIn === laneEsc in every single row
            // (6475/6475, 97/97, ...), because the override runs on every tick
            // a lane covers the player — so the second number was a copy of the
            // first and carried no information at all. What is worth knowing is
            // how often the override actually OVERRULED the danger field, which
            // is the whole claim being made for it. Compare against the field's
            // own argmax before replacing it.
            const fdot = (best.dx || 0) * laneEscape.x + (best.dy || 0) * laneEscape.y;
            if (fdot < 0.7) laneDivTicks++;
            vx = laneEscape.x; vy = laneEscape.y;
            laneEscTicks++;
        } else if (huntOn && huntPost) {
            const dPost = hyp(p.x - huntPost.x, p.y - huntPost.y);
            if (dPost <= (DHp.dormantHuntRadius || 20)) { vx = 0; vy = 0; onPost = true; }
            else { vx = (huntPost.x - p.x) / dPost; vy = (huntPost.y - p.y) / dPost; }
        } else if (parkOn) {
            const dCnr = hyp(p.x - cnrX, p.y - cnrY);
            if (dCnr <= (DHp.parkRadius || 26)) { vx = 0; vy = 0; parked = true; }
            else { vx = (cnrX - p.x) / dCnr; vy = (cnrY - p.y) / dCnr; }
        } else if (seatOn) {
            const dSeat = hyp(p.x - cnrX, p.y - cnrY);
            if (dSeat <= (DHp.parkRadius || 26)) { vx = 0; vy = 0; }
            else { vx = (cnrX - p.x) / dSeat; vy = (cnrY - p.y) / dSeat; }
            seated = true;
        } else if (harvOn && poW) {
            // walk to the pile; ultHarvest's own gates (!hpPanic, !markHere,
            // !projHere) already cleared, and harvWant bounded the range.
            // v6.94.0: with a live burn and a computed stand point, go to the
            // END of the pierce line instead of the centroid, then CREEP down
            // the line so the facing stays locked along it (the pile itself
            // blocks the walk — passouts deal no contact damage).
            let tx = poCx, ty = poCy, creep = null, crowdBiased = false;
            if (flameHarvest && flameTarget && flameTarget.sx != null) {
                tx = flameTarget.sx; ty = flameTarget.sy;
                creep = { x: flameTarget.ldx, y: flameTarget.ldy };
            } else if (farmRef.v) {
                // v6.95.0: hold the pile on the CROWD side. With mobs in
                // front of the passout, fireBase's nearest target is a mob
                // whose kill pays XP — and pat's splash / joe's pierce leak
                // into the pile behind it on every volley.
                let cx = 0, cy = 0, cn = 0;
                for (const e of th.enemies) {
                    if (e.wall || e.boss || e.dormant || e.distant) continue;
                    if (hyp(e.x - p.x, e.y - p.y) > 300) continue;
                    cx += e.x; cy += e.y; cn++;
                }
                if (cn) {
                    const bx = cx / cn - tx, by = cy / cn - ty;
                    const bl = hyp(bx, by) || 1;
                    const bias = CONFIG.movement.harvestCrowdBias != null ? CONFIG.movement.harvestCrowdBias : 36;
                    tx += (bx / bl) * bias; ty += (by / bl) * bias;
                    crowdBiased = true;   // the shifted point is the station — walk the last 36px
                }
            }
            const dPo = hyp(p.x - tx, p.y - ty);
            if (dPo <= (crowdBiased ? 18 : (MH.harvestStopPx || 72))) {
                if (creep) { vx = creep.x; vy = creep.y; }
                else { vx = 0; vy = 0; }
            } else { vx = (tx - p.x) / dPo; vy = (ty - p.y) / dPo; }
            harvesting = true;
        } else if (trekOn && trekT) {
            const dT = hyp(p.x - trekT.x, p.y - trekT.y);
            vx = (trekT.x - p.x) / dT; vy = (trekT.y - p.y) / dT;
            trekking = true;
        }
        // v6.91.8: record the entrance build and the first park engagement. Both
        // are per-run and cost nothing; see PARK_AUDIT_KEY.
        if (hellDetected) {
            if (entrySample == null && gtCorner >= (DHp.parkFromS != null ? DHp.parkFromS : 1200)) {
                const dEnt = liveDefense();
                entrySample = {
                    gt: Math.round(gtCorner),
                    def: dEnt == null ? 0 : +dEnt.toFixed(1),
                    regen: +regenRate().toFixed(2),
                    supers: (typeof supersThisRun === 'number' ? supersThisRun : 0),
                    zoner: !!zoner,
                    // v6.95.2: the two consistency numbers the entry ramp is
                    // FOR — was the bot in the seat when hell arrived, and
                    // how far had the ult levelled.
                    seated: !!(parked || seated),
                    ultLv: safe(() => player.ultLevel, 0) || 0
                };
            }
            if (parkOn) { parkOnTicks++; if (parkFirstS == null) parkFirstS = Math.round(gtCorner); }
            if (parked) parkedTicks++;
            // v6.116.0: the miss census. Evaluated in the SAME order the
            // planner evaluates — parkOn's own clauses first (they are what
            // the boolean is built from), then the overrides that outrank the
            // park branch in the chain above, then the walk. First match wins,
            // so every hell tick lands in exactly one bucket and the buckets
            // sum to hellTicks - parkedTicks.
            if (!parked) {
                const why = DHp.park === false ? 'off'
                    : !parkArmor ? 'armor'
                    : !parkRegen ? 'regen'
                    : !parkClear ? 'clear'
                    : gtCorner <= (DHp.parkFromS != null ? DHp.parkFromS : 1200) ? 'early'
                    : markHere ? 'mark'
                    : lineOnCorner ? 'line'
                    : parkYieldFrozen ? 'yield'
                    : capDive ? 'cap'
                    : laneEscape ? 'lane'
                    : (huntOn && huntPost) ? 'hunt'
                    : 'walk';
                parkMiss[why] = (parkMiss[why] || 0) + 1;
            }
        }
        lastDir = { x: vx, y: vy };

        // ── v6.112.0 THE DEEP-HELL REGIME, measured as a state ──────────────
        //
        // USER: "deep hell should be framed as when corner anchoring works and
        // the bot just fires ultimates to keep itself alive without any
        // movement required due to the bosses being too large and stop giving
        // tips."
        //
        // Placed here because it needs the FINAL heading. `parked` is set by
        // the override chain above and `vx/vy` are only settled once that
        // chain has run — reading either earlier books the previous tick's
        // posture, and the whole point of this measurement is that the bot is
        // standing still RIGHT NOW.
        //
        // Note what is NOT gated on: the ult. "Fires ultimates to keep itself
        // alive" is recorded as `deepInv`, a quality of the hold, not a
        // condition of entering it. If the regime turns out to be held at a
        // low ult share, that is the mitigation model being right — armour,
        // not ults, is what makes the corner survivable — and gating on the
        // ult would have hidden the finding instead of producing it.
        const DR = CONFIG.deepRegime || {};
        const gtReg = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const tipsDone = gtReg >= (CONFIG.deepHell.tipWindowToS || 4800);
        const regimeNow = hellDetected &&
            (DR.requireRing === false || ringHuge) &&
            (DR.requireTips === false || tipsDone) &&
            (DR.requireParked === false || parked);
        if (regimeNow) {
            deepRegimeTicks++;
            if (deepFirstGt == null) deepFirstGt = gtReg;
            if (deepStreakFrom == null) deepStreakFrom = gtReg;
            const held = gtReg - deepStreakFrom;
            if (held > deepHoldBest) deepHoldBest = held;
            // "without any movement required" — the literal claim, checked
            // rather than assumed. park zeroes the vector; anything else is
            // the bot still working for its survival.
            if (vx === 0 && vy === 0) deepStillTicks++;
            if (ultInvuln) deepInvTicks++;
            deepHpSum += hpRatio;
        } else {
            // v6.115.0: WHY the streak broke. The first live rows held the
            // regime for 75 / 17 / 1 / 0 s against a 120 s threshold, so
            // deepHeldRate 0 says nothing about whether the anchor works — it
            // says the run kept falling out of the regime. Which clause drops
            // is the whole question, and the boolean could not answer it.
            if (deepStreakFrom != null) {
                const why = (DR.requireRing !== false && !ringHuge) ? 'ring'
                    : (DR.requireTips !== false && !tipsDone) ? 'tips'
                    : (DR.requireParked !== false && !parked) ? 'park' : 'hell';
                deepBreaks[why] = (deepBreaks[why] || 0) + 1;
                const held = gtReg - deepStreakFrom;
                if (held > 0) deepHolds.push(Math.round(held));
            }
            deepStreakFrom = null;
        }

        // v6.89.8 CORNERWARD. Source-verified: `tryDash` sets only dashDx/dashDy/
        // dashUntil — it grants NO invulnerability and no i-frames. It is a
        // 0.16 s movement burst, i.e. a pure MULTIPLIER on the heading the
        // planner already chose, and therefore only ever as good as that
        // heading. In panic the heading is a flee vector, so dashing there
        // carries the bot OUT of its corner faster (user, observed). The
        // abilities layer needs to know which way this heading points before it
        // can decide whether amplifying it is a good idea.
        const cornerward = hyp(cnrX - p.x, cnrY - p.y) > 1
            ? ((vx * (cnrX - p.x) + vy * (cnrY - p.y)) / hyp(cnrX - p.x, cnrY - p.y)) > 0.2
            : true;

        return {
            dx: vx, dy: vy, cornerward, markHere, parkOn, parked,
            // v6.107.0 drop anchor: exposed so a test can assert the ARMING
            // conditions directly rather than inferring them from a vector.
            dropAnchor: anchorOn, anchorN, anchorTtk,   // v6.107.0 (NOT `anchor` — that is the farm stance, set below)
            capDive,   // v6.96.0: the run is being ended on purpose
            capStage,  // v6.101.0: 0 none, 1 smother, 2 hurtPlayer, 3 hard book
            dayFarmBase, markFearMul,   // v6.97.0: sprint gate + shieldless mark fear, observable
            // v6.111.0: the COMPOSED farm multiplier, not just its base. The
            // ult-window term added here is otherwise unobservable, and an
            // unobservable term is one no test can hold and no report can
            // audit — which is how ultWindowFarmMul shipped untested in the
            // first draft of this version.
            dayFarmMul: +dayFarm.toFixed(3),
            // v6.91.0 dormant-boss hunt telemetry
            // v6.91.3: the seat and the armour reading are now observable — both
            // were wrong for versions precisely because nothing reported them.
            seat: { x: +cnrX.toFixed(1), y: +cnrY.toFixed(1) },
            parkYieldFrozen, parkFirst: parkFirstS, pauseShare: (() => { const s = pauseShareRun(); return s == null ? null : +s.toFixed(3); })(),
            armorLv: +armorLv.toFixed(2),
            hunting: huntOn, onPost, dormantBoss: !!huntTarget, huntVacate,
            huntFrozen: !!(huntTarget && huntTarget.frozen),
            huntDmg: (huntMark && typeof huntMark.hp0 === 'number' && typeof huntMark.hp === 'number')
                ? Math.round(huntMark.hp0 - huntMark.hp) : null,
            huntGap: huntTarget ? Math.round(huntTarget.gapField) : null,
            huntLeft: (huntOn && huntStartS != null)
                ? +Math.max(0, (DHh.dormantHuntS != null ? DHh.dormantHuntS : 20) - (gtHunt - huntStartS)).toFixed(1)
                : null,
            danger: best.danger, gain: best.gain, hpRatio, panic, hpPanic, slowMul,
            pauseActive, contactImminent, flight, grind, depth: +depth.toFixed(2),
            blastImminent: th.marks.some(m => typeof m.tLeft === 'number' && m.tLeft <= 0.45 &&
                hyp(m.x - p.x, m.y - p.y) < m.r),
            // v6.111.0: the lane override, observable. `laneIn` is how many
            // lanes cover the player right now, `laneEsc` the unit exit the
            // override is steering — a posture that cannot be observed cannot
            // be tuned, and this one replaces a dash heading nobody could see.
            laneIn: laneCov, laneEsc: laneEscape ? { x: +laneEscape.x.toFixed(2), y: +laneEscape.y.toFixed(2) } : null,
            // v6.112.0: the regime, live on the panel and in pineBot.plan().
            // `deepRegime` is the state right now; `ringHuge`/`tipsDone` are
            // its two hard clauses reported separately so a row that never
            // enters it says WHICH clause was missing rather than only that
            // it did not happen.
            deepRegime: regimeNow, ringHuge, tipsDone,
            deepHold: Math.round(deepHoldBest),
            surge: surgeActive, hellRecent, rainbowRecent, projImminent, laneUrgent, rivalUrgent, frozenUrgent, sprinterUrgent, stacking: !!stopBoss, flameAnchor, cornerAnchor: cornerOn, stackStation: stopStation, chase: !!th.rival, zoner, knocker, anchor, kiting: !!kite, outrunnable, fastChasers, liveChasers, lineOnCorner, lineHere, kiteSpacing, contactGap: isFinite(contactGap) ? Math.round(contactGap) : null, kiteDamp: +kiteDamp.toFixed(2), kiteW: +kiteW.toFixed(3), kiteBuildShare: +kiteBuildShare.toFixed(2), flame: flameOn, hunger: +buildHunger.toFixed(2),
            toughness: +toughnessAvg.toFixed(2),
            passoutsNear: th.passouts.filter(po => hyp(po.x - p.x, po.y - p.y) < 190).length,
            poCentroidDist: poN ? Math.round(hyp(p.x - poCx, p.y - poCy)) : null,
            poNearest: poNearest == null ? null : Math.round(poNearest), ultFalloff: ultFall,
            ultInvuln, auraUlt, ultKind: charOf().ultKind || 'nuke',
            // nearest live (non-passout) body — how the ult gate decides
            // whether a spray/aura ult has anything to actually hit
            adjacent: th.enemies.reduce((m, e) => Math.min(m, hyp(e.x - p.x, e.y - p.y) - (e.r || 0)), Infinity),
            poTtk: (poTtkOut == null || !isFinite(poTtkOut)) ? null : Math.round(poTtkOut),
            poDps: poDpsOut ? Math.round(poDpsOut) : 0, poGaveUp: poGiveUp.size,
            armorLv, armorConf: +armorConf.toFixed(2), holdoutAnchor,
            flameAim: flameTarget ? Math.round(flameTarget.d) : null,
            flameAimPo: flameTarget ? flameTarget.po === true : null,
            ultHarvest, ultInS: Math.round(ultInS), ultReadyNow, harvesting,
            fundRush, litter: litterN,   // v6.99.1 probe visibility
            trekking, trekKind: trekT ? trekT.kind : null, farmStance: farmRef.v, seated,
            pierceLine: best ? (best.pierceHits || 0) : 0,
            flameLine: flameTarget && flameTarget.line != null ? flameTarget.line : null,
            poField: th.passouts.length, poFree: th.passouts.reduce((n, po) => n + (po.contested ? 0 : 1), 0),
            kiteAt, fleeNear, contestTol: th.contestTol, trek: trekPo ? Math.round(hyp(p.x - trekPo.x, p.y - trekPo.y)) : null,
            wallNear: th.enemies.some(e => e.wall && hyp(e.x - p.x, e.y - p.y) < 190),
            bossNear: th.enemies.some(e => e.boss && !e.wall && hyp(e.x - p.x, e.y - p.y) < 240),
            roamingBoss: th.enemies.some(e => e.boss && !e.wall && !e.stationary && hyp(e.x - p.x, e.y - p.y) < 260),
            enemies: th.enemies.length, near: th.near, boss: th.boss,
            projectiles: th.projectiles.length, marks: th.marks.length,
            lines: th.lines.length, loot: loot.length,
            // v6.89.2: the POSTURE is now on the panel. The corner doctrine sat
            // behind a 150-minute gate no recorded run ever reached, and nothing
            // on screen said so — the only way to notice was to read the config.
            // A posture that cannot be observed cannot be tuned, so kite /
            // anchor / corner are reported live alongside the numbers.
            diag: `hp ${(hpRatio * 100).toFixed(0)}%${shieldMax ? '(+' + Math.round(shield) + 'sh)' : ''} | ${th.enemies.length}e ${th.projectiles.length}p ${th.marks.length}m ${loot.length}L | danger ${best.danger.toFixed(1)} | ${th.rival ? 'CHASE! ' : ''}${panic ? 'PANIC' : 'normal'}${depth > 0 ? ' | deep ' + Math.round(depth * 100) + '%' : ''} | ${huntOn ? (onPost ? 'ON-POST' : 'HUNT') : parkOn ? (parked ? 'PARKED' : 'to-corner') : cornerOn ? 'CORNER' : (anchor ? 'ANCHOR' : (kite ? (kiteSpacing ? 'space' : 'kite') : 'free'))}${kiteSpacing && (cornerOn || anchor) ? '+space' : ''}`
        };
    }


    function maybeAbilities(plan) {
        const now = Date.now();
        // v6.100.0 SPEED-INVARIANT ABILITY CLOCK: the dash and ult retry
        // gates are millisecond gates, and at a frame multiplier wall-ms run
        // slow against the game (one ult ask per ~200 game-seconds at 100x —
        // the 6.99.3/4 wreckage). Both gates now read GAME milliseconds when
        // gameTime exists; a stamp from a previous run (gameTime restarted)
        // resets to zero.
        const gtClk = safe(() => (typeof gameTime === 'number' ? gameTime : null), null);
        const clockMs = gtClk != null ? gtClk * 1000 : now;
        if (lastUlt > clockMs) lastUlt = 0;
        if (lastDash > clockMs) lastDash = 0;
        const A = CONFIG.abilities;
        // v6.101.0 THE CAP LADDER, RUNGS 2 AND 3. Stage 1 (the smother) is
        // pure movement and lives in 05. These two are game calls, so they
        // live here — the layer that owns them. They only ever run on a run
        // that is ALREADY past the cap and has already failed to die by
        // standing in the crowd, so neither can touch an ordinary run.
        if (plan.capStage >= 2) {
            // RUNG 2: the game's own damage function. hurtPlayer is a
            // top-level `function` declaration, so unlike the game's `let`
            // globals it really is on window (see the LEXICAL GLOBAL ACCESS
            // note). It sets invuln=38 frames itself, so a poke every half
            // game-second is already the maximum the game will honour.
            const gtH = safe(() => (typeof gameTime === 'number' ? gameTime : 0), 0) || 0;
            if (hasGame('hurtPlayer') && (gtH - capHurtAt >= 0.5 || gtH < capHurtAt)) {
                capHurtAt = gtH;
                callGame('hurtPlayer', 1e6);
            }
        }
        if (plan.capStage >= 3) {
            // RUNG 3: the guarantee. If the crowd would not kill us and the
            // game exposes no damage hook, the run still ENDS — booked
            // through the same finishRun() path a natural death uses (it is
            // idempotent, so a later real death cannot double-book it), then
            // navigated out so the unattended farm starts a fresh run. An
            // immortal build can no longer park a window for four hours.
            if (runActive) {
                deathSnapshot = deathSnapshot || snapshotStats();
                finishRun();
                setStatus('RUN CAP: booked by force at stage 3');
            }
            if (!capForcedThisRun) { capForcedThisRun = true; log('run cap: hard book + restart'); }
            releaseAll();
            callFirst(['backToTitle']);
            return;   // nothing else this tick — the run is over
        }
        // DASH (defensive): the lower our HP, the earlier we bail out — and
        // standing inside a telegraphed blast zone is an emergency that
        // overrides the normal danger threshold entirely.
        // DEMO-CORRECTED dash cadence: at depth the manual run dashes ~59x
        // per minute while slowed 71% of the time — the dash is how you move
        // when frozen ground is permanent. Deep hell + slowed relaxes both
        // the danger bar and the rate limit; the day game stays disciplined.
        const deepHell = hellDetected && (typeof G.gameTime === 'number' ? G.gameTime : 0) > 2400;
        const slowedNow = plan.slowMul != null ? plan.slowMul < 0.95 : false;
        // USER DOCTRINE: in hell the dash is contact insurance against bodies
        // that have scaled past killable — EXCEPT while a time-pause item is
        // holding the field, where nothing is moving and a dash is wasted.
        const hellDash = hellDetected && plan.pauseActive !== true;
        const dashThreshold = A.dashDangerScore * (0.4 + 0.8 * plan.hpRatio) *
            ((deepHell && slowedNow) ? 0.45 : (hellDash ? 0.6 : 1));
        const inBlastZone = dangerAccum.mark > 1.5 || dangerAccum.line > 1.5;
        // about to be hit by a telegraphed blast we are standing in
        const blastImminent = plan.blastImminent === true;
        // DEEP HELL (v6.82.0): the gate tightens with depth — 650 ms at the
        // 2-hour mark sliding toward CONFIG.deepHell.dashGateMs at full depth
        const depthNow = plan.depth || 0;
        const deepGate = Math.round(650 + (CONFIG.deepHell.dashGateMs - 650) * depthNow);
        const dashGate = plan.flight ? 300
            : (deepHell && slowedNow) ? Math.min(A.dashCooldownMs, 420)
            : (hellDash ? Math.min(A.dashCooldownMs, deepGate) : A.dashCooldownMs);
        // v6.89.8 THE DASH CARRIES NO I-FRAMES. Read whole from source:
        //
        //   function tryDash(dirx,diry){ ... player.dashDx=dirx; player.dashDy=diry;
        //     player.dashUntil=gameTime+0.16; player.dashReadyAt=gameTime+dashCd(lv); ... }
        //
        // No invuln, no dashInvuln, nothing the contact loop's `!isInvuln()`
        // gate would see. So the dash is a 0.16 s speed burst along whatever
        // heading the planner already picked — a MULTIPLIER on that decision,
        // never a defence in its own right.
        //
        // Two consequences at depth. It cannot open a gap: bodies measured at
        // 50-119 px/frame cover the whole 540 px arena in 4-11 frames, so the
        // burst is spent against something that re-closes inside the same
        // window. And when the planner is in panic the heading is a flee
        // vector, so dashing AMPLIFIES the move away from the corner — the
        // user's observation, and the mechanism behind it.
        //
        // The deepest demo ever recorded (178:19 → 244:04, crowdMedian 234,
        // hpMedian 100) logs `dashes: 0`. The "~59 dashes/min" comment above
        // comes from a shallower run; where the two disagree, the one that
        // reached 244 minutes wins.
        //
        // So past deep-hell depth the dash is allowed only when amplifying the
        // heading is actually useful: it points at the corner, or it is
        // escaping a blast/mark — the one hazard class position still defeats
        // (corner mark-immunity is geometric: 80.9 px against a 70 px reach).
        // USER DIRECTIVE (6.89.8): "without dashing on panic mode in deep hell
        // ... and anchor towards one of the four corners." Panic is precisely
        // when the heading is a flee vector, so it is precisely when amplifying
        // it does the most damage. Escaping a blast or a mark still overrides —
        // that is the one hazard class a position change actually defeats.
        // v6.89.12 THE PANIC GATE WAS NOT BITING (user: "still dashing away
        // instead of anchoring when in panic mode"). Two independent leaks, and
        // either alone was enough to defeat it.
        //
        // 1. THE DEPTH KEY WAS A 40-MINUTE CLOCK. `deepHell` is
        //    `hellDetected && gameTime > 2400`, but the measured median run is
        //    1325 s — twenty-two minutes. The MAJORITY of runs, and therefore of
        //    deaths, never reached the gate at all.
        //
        //    The right key is not a clock, it is the same physics that governs
        //    the kite: a dash is a 0.16 s movement burst with no i-frames, so if
        //    the pack cannot be outrun, a burst cannot open a gap either.
        //    `outrunnable` measures exactly that, live, per frame — and per the
        //    source speed curve it turns false around minute eleven, not forty.
        //
        // 2. `inBlastZone` IS A DECAYING ACCUMULATOR, NOT A HAZARD TEST.
        //    `dangerAccum` adds 0.25 per overlapping tick and decays x0.96, so
        //    it sits near 6.25 while a mark is on us and takes ~35 ticks to fall
        //    back under the 1.5 threshold. It answers "was there a mark on me
        //    recently", which kept `escaping` true — and short-circuited the
        //    whole suppression — long after the hazard had gone.
        //
        // Escaping now asks the instantaneous questions only: am I standing in
        // a mark, in a lane, or under a blast that is about to land.
        const escaping = blastImminent || plan.markHere === true || plan.lineHere === true;
        const cornered = plan.outrunnable === false;
        const deepPanic = cornered && (plan.panic === true || plan.hpPanic === true);
        const cornerHeld = plan.cornerAnchor === true;
        const dashProductive = escaping ||
            (!deepPanic && (!cornerHeld || plan.cornerward === true));
        // v6.96.2 (user): "it ... doesn't need to dash" past the run cap —
        // the dash is a 0.16 s escape burst, i.e. exactly the tool that keeps
        // carrying the bot OUT of the projectile paths that are supposed to
        // end the run. Holstered like the ult while the cap patrol walks.
        // v6.101.0 THE DASH HOLSTER GETS THE ULT'S BELT AND BRACES. The ult
        // gate below has ALWAYS carried its own `gtU >= runCapS` clock check
        // as well as reading plan.capDive; the dash gate read the plan alone.
        // So any tick whose plan lacked the flag re-armed the dash past the
        // cap while the ult stayed correctly holstered — and one dash is not
        // cosmetic here: it is a 0.16 s movement burst that BREAKS the
        // sustained contact the kill depends on and resets the ~36 s clock.
        // The user watched exactly this ("using dashes even after when it's
        // supposed to just get constant contact damage"). Now both gates
        // answer the same question the same way.
        const gtDash = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const capHolster = plan.capDive === true ||
            ((CONFIG.deepHell.runCapS || 0) > 0 && gtDash >= CONFIG.deepHell.runCapS);
        if (!capHolster && A.dashEnabled && dashProductive && hasGame('tryDash') && clockMs - lastDash > dashGate &&
            (plan.danger > dashThreshold || inBlastZone || plan.projImminent || plan.laneUrgent ||
                plan.rivalUrgent || plan.frozenUrgent || plan.sprinterUrgent || plan.contactImminent ||
                plan.flight || blastImminent)) {
            lastDash = clockMs;
            callGame('tryDash', plan.dx, plan.dy);
        }
        // ULTIMATE (damage + INVINCIBILITY): best spent when damage is coming
        // regardless of movement. Triggers, in value order:
        //  - emergency: planner danger far past the dash threshold = an
        //    unavoidable hit — the invincibility eats it
        //  - hell-entry onslaught with a wave already on top of us
        //  - mid-surge crowds, big crowds, low HP, boss, panic-surrounded,
        //    losing the DPS race
        const defensive = plan.panic && plan.near >= 4;
        const offensive = plan.boss || (dpsDeficit > 0.6 && plan.near >= Math.ceil(A.ultCrowd * 0.7));
        const emergency = plan.danger > A.dashDangerScore * 1.6;
        const entryHold = plan.hellRecent && plan.near >= 5;
        const surgeCrowd = plan.surge && plan.near >= 5;
        // passout harvest (user: use the ult AGGRESSIVELY here): ANY passout
        // in range is an ult payday — damage + invincibility, and the loot
        // funds the build. The game's own cooldown is the only limiter.
        // fire from the middle of the group when possible (the spiral covers
        // everyone); a big cluster or a lone passout in range fires anyway
        // v6.86.1 PER-CHARACTER ULT DOCTRINE. Everything below this line used
        // to assume minguk's nuke. Read from the live source:
        //   nuke  (minguk): dealDmg(e, 1e7*2.5^(lv-1)) to EVERY enemy,
        //     passouts included — a passout field is genuinely free loot, so
        //     the harvest/lootTargets doctrine stands unchanged.
        //   spray (pat) / aura (joe): no field-wide damage at all. A passout
        //     carries d.hp*strength*2 HP (strength = 8*(1+(estBoss-1)*0.7)*
        //     (1+gt/60*0.22)) — tens of thousands by minute 10 — while pat's
        //     spiral pays dmg*9.6*2^(lv-1) per projectile scattered in every
        //     direction and joe's spikes reach ~149px. Spending those on a
        //     passout cluster buys nothing; their value is the invulnerability
        //     window and what is ALREADY next to us.
        const CH = charOf();
        const nukeUlt = CH.ultKind === 'nuke' || CH.ultKind == null;
        const ultAdj = A.ultAdjacent || 130;
        const adjacentNow = isFinite(plan.adjacent) ? plan.adjacent <= ultAdj : (plan.near >= 3);
        // v6.86.2 CORRECTION (user, confirmed by the source arithmetic):
        // "the only way pat can clear out passouts consistently is through
        // flame crosses and ultimates". 6.86.1 went too far by taking
        // passouts off the spray/aura target list entirely. The right rule is
        // RANGE, not target type: pat's spiral pays 39 volleys x 3 arms x 691
        // (80k at lv1, 636k at lv3) but only into what it sweeps, and joe's
        // spikes cover ~149px. A passout is 27k HP at 15 min and 77k at 20 —
        // hopeless for base attacks, routine for an ult fired while hugging
        // it. So: passout + adjacent = fire; passout across the floor = no.
        const poAdjacent = plan.poNearest != null && plan.poNearest <= ultAdj;
        const harvest = !plan.hpPanic && (nukeUlt
            ? ((plan.passoutsNear || 0) >= 3 ||
               ((plan.passoutsNear || 0) >= 1 && (plan.poCentroidDist == null || plan.poCentroidDist < 80)))
            : poAdjacent);
        // v6.85.8 (user: "the bot should be using the ultimate more frequently
        // to kill passouts"). Adding another TRIGGER would have done nothing —
        // `lootTargets` already fires on any passout within 190px, so every
        // trigger-shaped version of this was measured redundant. What actually
        // limits the rate is the RETRY GATE: the bot asks the game for the ult
        // every ultCooldownMs, so a passout can sit in range for over a second
        // after the game's own cooldown ends. With a passout in falloff range
        // the retry drops to 900 ms so the ult goes off as soon as the game
        // allows it. callGame is a no-op while the real cooldown runs.
        // the retry gate drops for ANY bartender standing on a passout — the
        // sooner the game's own cooldown is cashed in, the more bodies clear
        const poClose = !plan.hpPanic && plan.poNearest != null && plan.poNearest < 120;
        // USER DOCTRINE: an available ultimate is SPENT on the high-loot
        // targets — NO BOOKING walls (42x hp: the ult burst breaks the
        // siege open), bosses in range, and passout clusters. Damage +
        // invincibility, and the loot funds the build.
        // MINGUK ULT DOCTRINE (user): the ultimate is the roaming-boss and
        // passout killer — any of them in range is reason enough to fire.
        const lootTargets = !plan.hpPanic && (nukeUlt
            ? (plan.wallNear === true || plan.bossNear === true || (plan.passoutsNear || 0) >= 1 ||
               plan.roamingBoss === true)
            // spray/aura: only what the ult can actually reach counts, and a
            // passout is never a reason to burn it
            : (poAdjacent || ((plan.wallNear === true || plan.bossNear === true) && adjacentNow)));
        const linebackerBurst = !plan.hpPanic && (plan.lines || 0) > 0 && plan.boss === true;   // charging linebacker: ult damage + invincibility
        // USER: when mob HP scales past what five supers can kill, the ult
        // becomes the regular clear tool — fire on cooldown into any group.
        const scalingMobs = (plan.toughness || 0) > 2 && plan.near >= 2 && !plan.hpPanic &&
            (nukeUlt || adjacentNow);
        // v6.86.1: for the two invulnerability ults, "something is about to
        // hit me and bodies are close" IS the payoff — spend it there rather
        // than saving it for a harvest that cannot happen.
        const survivalUlt = !nukeUlt && (plan.hpRatio < 0.55 || plan.contactImminent === true ||
            plan.flight === true || (plan.panic === true && adjacentNow));
        // DEEP RUN (user): past ~80 minutes, or any time flight mode is on,
        // the ult goes off on cooldown — killing is how a TIME STOP drops,
        // and the invincibility window is free survival either way.
        const gtDeep = typeof G.gameTime === 'number' ? G.gameTime : 0;
        // NOTE (v6.85.6): dropping `!hpPanic` here was tried and reverted —
        // it is unreachable. Flight requires near >= 4, hpPanic implies panic,
        // and `defensive` (panic && near >= 4) already fires the ult in every
        // low-HP flight state. The directive's "using ultimate" is satisfied
        // by that path; the fix that actually mattered was flight itself
        // staying on at low HP, which is what opens the 300 ms dash gate.
        const ultSpam = !plan.hpPanic && (plan.flight === true || (hellDetected && gtDeep > 4800));
        // DEEP HELL (v6.82.0): a body about to land on us at depth is the
        // hit that ends 68% of runs — if the ult is up, its invincibility
        // window is worth more than any harvest it was being saved for.
        const contactSave = CONFIG.deepHell.ultOnContact && plan.contactImminent === true && (plan.depth || 0) > 0;
        // FIRST-20-MINUTES AGGRESSION (user): during the funding phase the
        // ult is retried at double cadence — every passout cleared early is
        // loot, XP, and upgrade potential compounding for the whole run.
        const gtU = typeof G.gameTime === 'number' ? G.gameTime : 0;
        // v6.111.0: the day retry drops to a flat ultDayRetryMs (1500) rather
        // than 0.6x the 2500 ms base (1500 — the same number, now named and
        // configurable). Stated plainly because this session nearly shipped a
        // much bigger change here: the retry gate is NOT the ult lever. The
        // game's own cooldown is ULT_CD 80 s x ultCdMul, so tightening the
        // retry only shaves the lag between that cooldown expiring and the bot
        // noticing — worth about 1% of casts. The levers are ult LEVEL (window
        // length) and ultCdMul, and both are bought at the level-up screen.
        let ultGate = (gtU < 1200 && !hellDetected)
            ? (A.ultDayRetryMs != null ? A.ultDayRetryMs : A.ultCooldownMs * 0.6)
            : A.ultCooldownMs;
        if (poClose) ultGate = Math.min(ultGate, 900);
        // v6.88.2 ULT CHAIN — the deep-hell engine, measured off manual demo #5
        // (178:19 -> 244:04, 9001 samples): hpMedian 100 with 234 enemies inside
        // 90 px, held by 2174 casts / 3945 s = one every 1.81 s against pat's
        // 2.834 s invulnerability window. The windows overlap and never lapse.
        //
        // The trigger for this already existed (`ultSpam`, past 80 min). The
        // limiter is this RETRY GATE: asking every 2500 ms is LONGER than the
        // window itself, and each time the retry misses the edge of the game's
        // real cooldown the chain opens for another 2.5 s. `callGame` is a
        // no-op while the real cooldown runs, so a tight retry costs nothing.
        // Only the two invulnerability ults qualify — minguk's nuke grants no
        // invulnerability at all, and its damage (1e7*2.5^(lv-1) = 9.8e8 at
        // Lv6) falls behind enemy HP (x1.4/180 s) at about 100 minutes, so
        // chaining it would burn the retry budget for nothing.
        // v6.88.2 (user): applied to ALL characters past the deep-deep
        // threshold, not only the two invulnerability ults. For spray/aura it
        // is load-bearing — the window is the only thing that stops the
        // contact loop. For minguk's nuke it is close to a no-op down here
        // (1e7*2.5^5 = 9.8e8 against enemy HP that passes it around 100 min,
        // and no invulnerability at all), but callGame is a no-op while the
        // real cooldown runs, so a tight retry costs nothing and keeps the
        // rule uniform.
        // v6.89.9: ALL THREE ults grant invulnerability — isInvuln() returns true
        // for ultUntil (joe), ultSpiralUntil (pat) AND the bare `claseUlt` object
        // (minguk). The old spray/aura test encoded a distinction that does not
        // exist in the source. Kept as a constant so the ultKind semantics stay
        // documented, but it no longer gates anything.
        const invulnUlt = true;   // was: CH.ultKind === 'spray' || CH.ultKind === 'aura'
        void invulnUlt;
        const DH = CONFIG.deepHell;
        const ultChain = hellDetected && gtU > (DH.ultChainFromS || 9000);
        if (ultChain) ultGate = Math.min(ultGate, DH.ultChainGateMs || 300);
        // v6.89.8 FIRE ON AVAILABILITY (user): "ultimate every time it's
        // available, for that invincibility and chance to kill a potential mob
        // ... for the item drops."
        //
        // Every other trigger above optimises the ult as a DAMAGE tool with a
        // crowd count, an HP ratio, or a harvest lead attached. Demo #5 measured
        // the opposite: 2174 casts over 3945 s, fired the instant available,
        // doing zero damage to the passout it was aimed at — a shield re-upped
        // 33 times a minute. Against that, the bot's own measured deep cadence
        // was one cast per 218 s, roughly one per 120 the human made.
        //
        // Two payoffs, and both survive minguk's lack of an invulnerability
        // window: the nuke still hits EVERY enemy on the field, and kills are
        // what drop items — which at depth means TIME STOPS, the one resource
        // that actually stops a pack moving 15-35x the player's speed. Holding
        // a charge back for a better moment is holding back the drop economy.
        //
        // `callGame` is a no-op while the game's real cooldown runs, so asking
        // every tick costs nothing but the call. `ultAlways` deliberately
        // bypasses `!plan.hpPanic` — being hurt is not a reason to save it.
        const ultAlways = hellDetected &&
            gtU > (DH.ultAlwaysFromS != null ? DH.ultAlwaysFromS : 2400);
        if (ultAlways) ultGate = Math.min(ultGate, DH.ultAlwaysGateMs || 250);
        // v6.96.0 THE RUN CAP: past runCapS the movement layer is walking the
        // bot into the crowd to die on purpose (see the config comment). The
        // ult's invulnerability window — pat's spiral, joe's Untouchable — is
        // the one tool that could carry a full build through that dive alive,
        // so past the cap it stays holstered no matter what else is true.
        // This deliberately outranks ultAlways, ultChain and every emergency
        // clause: they all serve survival, and survival is no longer the job.
        // v6.99.3: the movement layer's plan carries the EARLY cap (the
        // stability-proof latch) — honor it here too, or the ult would carry
        // an early-capped build through its own patrol.
        const capDive = ((DH.runCapS || 0) > 0 && gtU >= DH.runCapS) || plan.capDive === true;
        if (!capDive && A.ultEnabled && hasGame('useUltimate') && clockMs - lastUlt > ultGate &&
            (plan.near >= A.ultCrowd || plan.hpRatio < A.ultHpRatio ||
                defensive || offensive || emergency || entryHold || surgeCrowd || harvest || lootTargets || linebackerBurst || scalingMobs || ultSpam || contactSave || survivalUlt ||
                ultChain || ultAlways)) {   // v6.88.2: deep + invuln ult = fire, unconditionally
            lastUlt = clockMs;
            callGame('useUltimate');
            poReconsider();   // v6.86.2: the ult is the passout clear tool — re-open bodies the base attack gave up on
        }
    }

    // Last-resort movement when the real player object can't be read:
    // keep moving so the bot is never a stationary target.
    let orbitAngle = 0;
    function fallbackMove() {
        orbitAngle += 0.05;
        driveDirection(Math.cos(orbitAngle), Math.sin(orbitAngle * 0.7));
        moveSource = 'blind orbit (no game bindings)';
    }

    // =================================================================
    // MAIN LOOP
    // =================================================================
    function mainLoop() {
        if (!running) return;
        try {
            const now = Date.now();
            // v6.108.0 SPEED SAMPLE — game-seconds advanced per wall-second.
            // 1.0 is a healthy page; the measured stall ran at 0.021, i.e.
            // 358 game-seconds across 4.8 wall-HOURS. Every 5 wall-seconds,
            // and only while a run is live so title screens do not dilute it.
            if (runActive) {
                const gtS = safe(() => (typeof gameTime === 'number' ? gameTime : null), null);
                if (gtS != null) {
                    if (spdLastGt == null || gtS < spdLastGt) { spdLastGt = gtS; spdLastWall = now; }
                    else if (now - spdLastWall >= 5000) {
                        const sp = (gtS - spdLastGt) / ((now - spdLastWall) / 1000);
                        if (isFinite(sp)) {
                            spdSamples.push(+sp.toFixed(3));
                            if (spdSamples.length > 400) spdSamples.shift();
                            if (spdWorst == null || sp < spdWorst) spdWorst = +sp.toFixed(3);
                        }
                        spdLastGt = gtS; spdLastWall = now;
                    }
                }
            }

            if (now - lastOverlay >= CONFIG.overlayMs) {
                lastOverlay = now;
                handleScreens();
                if (!running) return;   // a handler may have stopped us (hell record)
            }

            // v6.100.0 SPEED-INVARIANT TICK: plan every tickMs of GAME time.
            // Under the frame multiplier this loop is itself called once per
            // VIRTUAL frame (rAF is multiplied), so gating on gameTime keeps
            // the per-game-second planning cadence identical at any speed.
            // The wall clock (250 ms) stays as the keep-alive for pauses and
            // states where gameTime is frozen or absent.
            const gtL = safe(() => (typeof gameTime === 'number' ? gameTime : null), null);
            const gtDue = gtL != null && (gtL < lastTickGt || gtL - lastTickGt >= CONFIG.tickMs / 1000);
            const wallDue = now - lastTick >= (gtL != null ? Math.max(CONFIG.tickMs, 250) : CONFIG.tickMs);
            if (gtDue || wallDue) {
                lastTick = now;
                if (gtL != null) lastTickGt = gtL;
                const st = G.state;
                const playing = (st == null) ? true : (st === 'playing');
                if (playing) {
                    if (haveRealState()) {
                        const plan = planMove();
                        if (plan) {
                            lastPlan = plan;
                            moveSource = 'game state (exact)';
                            driveDirection(plan.dx, plan.dy);
                            maybeAbilities(plan);
                            if (runActive) deathSnapshot = snapshotStats();
                        }
                    } else {
                        fallbackMove();
                    }
                } else {
                    releaseAll();
                }
            }
        } catch (e) {
            // Never let an exception kill the rAF chain — that was the v4 bug.
            console.warn('[PineBot] loop error (recovered):', e);
        }
        rafId = requestAnimationFrame(mainLoop);
    }

    function startBot() {
        if (running) return;
        running = true;
        stopReason = null;
        applyParams(bestParams());
        lastTick = 0; lastOverlay = 0; lastTickGt = 0;
        rafId = requestAnimationFrame(mainLoop);
        setStatus('running');
        log('started');
    }
    function stopBot(reason) {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        releaseAll();
        stopReason = reason || null;
        setStatus(reason ? '⛔ ' + reason : 'stopped');
        log('stopped', reason || '');
    }

    // =================================================================
    // CONTROL PANEL
    // v6.104.0 REBUILT FOR PEOPLE WHO ARE NOT ME (user: "more ux friendly
    // for other users to start the bot, stop the bot, hide the overlay").
    // Five controls, no jargon on the face of it, and the two destructive
    // ones removed outright: RESET wiped the learning store on a single
    // misclick, and DIAG/SNAP duplicated things the report already carries.
    // Both survive as console calls (pineBot.reset(), pineBot.diagnose()).
    // =================================================================
    let statusEl = null, infoEl = null, panelEl = null, restoreEl = null;
    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

    const PANEL_HIDE_KEY = 'pineBotPanelHidden';
    const mmss = s2 => {
        const v = Math.max(0, Math.round(s2 || 0));
        return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
    };

    // v6.104.0 (user): "have the auto-kill protocol be able to be initiated
    // from it". Latching capEarly is the whole implementation — the tested
    // ladder (smother -> hurtPlayer at capStandS -> hard book + restart at
    // capForceS) then runs exactly as it does for a proven-immortal build,
    // so the run BOOKS and the farm carries on. Deliberately NOT endRun(),
    // which books the row but also stops the bot and needs a human to
    // restart it.
    function killNow() {
        if (!runActive) { setStatus('no run in progress'); return 'no run in progress'; }
        capEarly = true;
        setStatus('KILL PROTOCOL engaged — ending this run');
        log('kill protocol engaged from the panel');
        return 'kill protocol engaged';
    }

    function pbBtn(label, o) {
        o = o || {};
        const b = document.createElement('button');
        b.textContent = label;
        if (o.title) b.title = o.title;
        b.style.cssText = [
            'cursor:pointer', 'border:0', 'border-radius:6px', 'margin:0',
            'padding:' + (o.pad || '6px 10px'),
            'font:inherit', 'font-weight:700', 'letter-spacing:.2px',
            'background:' + (o.bg || 'rgba(255,255,255,.09)'),
            'color:' + (o.fg || '#e8e8ef'),
            'transition:filter .12s', 'white-space:nowrap',
            o.grow ? 'flex:1 1 0' : 'flex:0 0 auto'
        ].join(';');
        b.onmouseenter = () => { b.style.filter = 'brightness(1.4)'; };
        b.onmouseleave = () => { b.style.filter = 'none'; };
        return b;
    }
    function pbRow(gap) {
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;gap:' + (gap || 5) + 'px;margin-bottom:6px';
        return d;
    }

    function setPanelHidden(hide) {
        if (panelEl) panelEl.style.display = hide ? 'none' : 'block';
        if (restoreEl) restoreEl.style.display = hide ? 'block' : 'none';
        try { localStorage.setItem(PANEL_HIDE_KEY, hide ? '1' : '0'); } catch (e) { }
    }

    function buildPanel() {
        if (!document.body || document.getElementById('pineBotPanel')) return;

        // The restore chip. Hiding the overlay must never be a one-way door,
        // so this is created FIRST and lives independently of the panel.
        restoreEl = pbBtn('🍸', { title: 'Show the Pine Bot panel', pad: '7px 9px', bg: 'rgba(16,16,22,.85)', fg: '#ffd98a' });
        restoreEl.style.cssText += ';position:fixed;right:10px;bottom:10px;z-index:2147483647;' +
            'box-shadow:0 3px 12px rgba(0,0,0,.4);display:none;font-size:15px';
        restoreEl.onclick = () => setPanelHidden(false);
        document.body.appendChild(restoreEl);

        const el = document.createElement('div');
        panelEl = el;
        el.id = 'pineBotPanel';
        el.style.cssText = [
            'position:fixed', 'right:10px', 'top:50%', 'transform:translateY(-50%)', 'z-index:2147483647',
            'background:rgba(16,16,22,.62)', 'color:#eee', 'font:11px/1.45 ui-monospace,Menlo,monospace',
            'padding:10px', 'border-radius:10px', 'width:232px', 'opacity:.8',
            'transition:opacity .15s,background .15s',
            'border:1px solid rgba(58,58,70,.6)', 'box-shadow:0 4px 18px rgba(0,0,0,.35)', 'user-select:none'
        ].join(';');
        el.onmouseenter = () => { el.style.opacity = '1'; el.style.background = 'rgba(16,16,22,.96)'; };
        el.onmouseleave = () => { el.style.opacity = '.8'; el.style.background = 'rgba(16,16,22,.62)'; };

        // ── header: name + hide ──────────────────────────────────────────
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;margin-bottom:8px';
        const title = document.createElement('div');
        title.textContent = '🍸 Pine Bot v' + scriptTag();
        title.style.cssText = 'font-weight:700;color:#ffd98a;flex:1 1 auto';
        const hideBtn = pbBtn('–', { title: 'Hide this panel (a 🍸 button appears bottom-right to bring it back)', pad: '2px 8px' });
        hideBtn.onclick = () => setPanelHidden(true);
        head.appendChild(title); head.appendChild(hideBtn);
        el.appendChild(head);

        // ── row 1: the two controls almost everyone wants ────────────────
        const r1 = pbRow();
        const startBtn = pbBtn('▶ Start', { title: 'Let the bot play', grow: true, bg: 'rgba(64,170,110,.85)', fg: '#eafff2' });
        const stopBtn = pbBtn('■ Stop', { title: 'Hand control back to you', grow: true, bg: 'rgba(190,70,70,.85)', fg: '#ffecec' });
        startBtn.onclick = () => startBot();
        stopBtn.onclick = () => stopBot();
        r1.appendChild(startBtn); r1.appendChild(stopBtn);
        el.appendChild(r1);

        // ── row 2: end run / report / record ─────────────────────────────
        const r2 = pbRow();
        const killBtn = pbBtn('⏻ End Run', {
            title: 'Run the auto-kill protocol now: the bot walks into the crowd, the run is scored and saved, and the next run starts automatically',
            grow: true
        });
        let killArmed = 0;
        killBtn.onclick = () => {
            const t = Date.now();
            if (t - killArmed > 3000) {          // two-step: one click never ends a run
                killArmed = t;
                killBtn.textContent = '⏻ Sure?';
                killBtn.style.background = 'rgba(220,140,50,.9)';
                setTimeout(() => {
                    if (Date.now() - killArmed >= 3000) {
                        killBtn.textContent = '⏻ End Run';
                        killBtn.style.background = 'rgba(255,255,255,.09)';
                    }
                }, 3100);
                return;
            }
            killArmed = 0;
            killBtn.textContent = '⏻ End Run';
            killBtn.style.background = 'rgba(255,255,255,.09)';
            killNow();
        };
        // v6.113.0: the report overlay is now the ONLY thing needed — it opens
        // with the headline numbers rendered above the JSON, the text
        // pre-selected, and a copy button that tells the truth about whether
        // it worked. Nothing here should ever require a console.
        const repBtn = pbBtn('📋', { title: 'Full report — every audit, summary on top, opens pre-selected. Copy and paste it to Claude.' });
        repBtn.onclick = () => {
            const r = safe(() => window.pineBot.report(), null);
            showReport(r || buildStatsReport());
        };
        const recBtn = pbBtn('🎥', { title: 'Record YOUR manual play as a teaching demo — click once to start, again to save' });
        recBtn.onclick = () => {
            demoToggle();
            const on = !!demoRec;
            recBtn.style.background = on ? 'rgba(210,60,60,.9)' : 'rgba(255,255,255,.09)';
            recBtn.textContent = on ? '⏺' : '🎥';
        };
        r2.appendChild(killBtn); r2.appendChild(repBtn); r2.appendChild(recBtn);
        el.appendChild(r2);

        // ── status + live info ───────────────────────────────────────────
        const stWrap = document.createElement('div');
        stWrap.style.cssText = 'border-top:1px solid rgba(255,255,255,.09);padding-top:6px';
        statusEl = document.createElement('div');
        statusEl.textContent = 'idle';
        statusEl.style.cssText = 'color:#8fd;margin-bottom:4px';
        infoEl = document.createElement('div');
        infoEl.style.cssText = 'color:#aab';
        stWrap.appendChild(statusEl); stWrap.appendChild(infoEl);
        el.appendChild(stWrap);

        document.body.appendChild(el);
        try { if (localStorage.getItem(PANEL_HIDE_KEY) === '1') setPanelHidden(true); } catch (e) { }
        setInterval(demoTick, 160);

        setInterval(() => {
            if (!infoEl) return;
            const st = G.state;
            const p = lastPlan;
            const gt = safe(() => gameTime, null);
            const vs = (learn.versions || {})[scriptTag()];
            // v6.88.0 AUDIT S1 STILL APPLIES: `lastAction` is built from a
            // clicked element's textContent, and the stuck-breaker clicks by
            // TEXT, so a leaderboard row carrying another player's display
            // name can reach this line. Every page-derived value goes in as a
            // TEXT NODE — never innerHTML, never string-concatenated markup.
            const rows = [];
            if (document.hidden === true) {
                rows.push(['⚠ background tab — the game is frozen here; keep this window visible', '#f9a']);
            }
            if (st === 'playing' && typeof gt === 'number') {
                rows.push([(hellDetected ? '🔥 hell  ' : '☀ day  ') + mmss(gt), '#cfe']);
            } else {
                rows.push([String(st == null ? 'waiting…' : st), '#cfe']);
            }
            rows.push([(primaryCocktail || 'no build yet') + '  ·  ' + runPicks.length + ' picks' +
                (supersThisRun ? '  ·  ' + supersThisRun + ' supers' : ''), '#aab']);
            // the ladder, but only while it is actually doing something
            if (p && p.capStage) {
                rows.push(['⚡ KILL PROTOCOL — stage ' + p.capStage +
                    (capFirstGt != null && typeof gt === 'number' ? '  ·  ' + Math.round(gt - capFirstGt) + 's' : ''), '#fc8']);
            }
            rows.push([learn.runs + ' runs total' +
                (vs && vs.n ? '  ·  this build ' + vs.n + ', best ' + Math.round(vs.bestT / 60) + 'm' : ''), '#889']);
            rows.push(['gen ' + learn.cem.gen + ' (' + learn.cem.batch.length + '/' + CONFIG.learning.batchSize + ')' +
                (championRun ? ' 👑' : '') + (lastDeathCause ? '  died→' + lastDeathCause : ''), '#778']);
            if (p && p.diag) rows.push([String(p.diag), '#667']);
            infoEl.textContent = '';
            for (const r of rows) {
                const line = document.createElement('div');
                line.textContent = r[0];
                line.style.color = r[1];
                infoEl.appendChild(line);
            }
        }, 400);
    }

    // =================================================================
    // DIAGNOSTICS + STATS REPORT
    // =================================================================
    // The 📊 report: everything needed to tune the bot from real data.
    // Copy it from the overlay and paste it to Claude for recommendations.
    function buildStatsReport() {
        const log = learn.runLog || [];
        const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0;
        const deaths = {};
        for (const e of log) if (e.death) deaths[e.death] = (deaths[e.death] || 0) + 1;
        const half = Math.floor(log.length / 2);
        return {
            report: 'PINE BOT STATS — paste this to Claude for tuning advice',
            version: scriptTag(),
            scoringProfile: CONFIG.scoringProfile,
            bartender: activeChar || '(bandit)', charProfile: charOf(),
            passoutFeasibility: (() => { const pl = lastPlan || {};
                return { killTimeS: pl.poTtk == null ? null : pl.poTtk, observedDps: pl.poDps || 0,
                         abandonedThisRun: pl.poGaveUp || 0, onField: pl.poField || 0 }; })(),
            runsTotal: learn.runs,
            runsLogged: log.length,
            byVersion: versionComparison(),
            averages: {
                time: avg(log.map(e => e.t)), downs: avg(log.map(e => e.d)),
                sales: avg(log.map(e => e.s)), reward: avg(log.map(e => e.r))
            },
            trend: log.length >= 6 ? {
                firstHalfAvgTime: avg(log.slice(0, half).map(e => e.t)),
                secondHalfAvgTime: avg(log.slice(half).map(e => e.t))
            } : 'need more runs',
            deathCauses: deaths,
            daysCleared: log.filter(e => e.day).length + '/' + log.length,
            hellRuns: log.filter(e => e.hell).length,
            bestRun: log.length ? log.reduce((a, b) => (b.r > a.r ? b : a)) : null,
            last10Runs: log.slice(-10),
            buildsUsed: Object.fromEntries(Object.entries(learn.builds).map(([k, v]) =>
                [k, { runs: +v.n.toFixed(1), mean: +(v.sum / v.n).toFixed(3) }])),
            // roster experiment scoreboard: how each candidate roster is
            // actually performing vs the prescribed incumbent
            rosterExperiment: {
                enabled: !!CONFIG.rosterExperiment,
                active: activeRoster,
                results: Object.fromEntries(Object.entries(learn.rosters || {}).map(([k, v]) =>
                    [k, { runs: +v.n.toFixed(1), mean: +(v.sum / Math.max(1e-9, v.n)).toFixed(3) }]))
            },
            improvementCurve: learn.genHistory.slice(-12),
            hallOfFame: learn.hof.map(h => +h.r.toFixed(3)),
            lastGradient: learn.lastGradient || null,
            strategyWeights: Object.fromEntries(Object.entries(CONFIG.strategy).map(([k, v]) => [k, +(+v).toFixed(2)])),
            currentRoadmap: { cocktails: PLAN_COCKTAILS.slice(), ingredients: PLAN_INGREDIENTS.slice(), hellUnbanApplied, avoidedIngredients: [...AVOID_INGREDIENTS] },
            cemGeneration: learn.cem.gen,
            hellEntryGaveUp: lastGiveUp
        };
    }

    function diagnose() {
        const api = ['goSelect', 'startGame', 'skipIntro', 'revealGame', 'pickUpgrade', 'closeTip',
            'confirmCraft', 'cancelCraft', 'pickCraftChoice', 'skipCraftChoice', 'closeNotice',
            'useUltimate', 'tryDash', 'saveScore', 'backToTitle', 'pauseGame', 'resumeGame',
            'finaleGo', 'finaleContinue', 'enterHell', 'nearestEnemy', 'weaponInfo'];
        const p = G.player;
        let keysWritable = false;
        try { keysWritable = writeKeyFlag('__pinebot_probe', true); writeKeyFlag('__pinebot_probe', false); } catch (e) { }

        const report = {
            version: scriptTag(),
            scoringProfile: CONFIG.scoringProfile,
            tab: TAB_ID,
            backgroundThrottled: document.hidden === true,
            running,
            state: G.state,
            playerReadable: !!p,
            player: p ? { x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, maxHp: p.maxHp, speed: p.speed } : null,
            counts: {
                enemies: Array.isArray(G.enemies) ? G.enemies.length : null,
                eprojectiles: Array.isArray(G.eprojectiles) ? G.eprojectiles.length : null,
                pickups: Array.isArray(G.pickups) ? G.pickups.length : null,
                dropMarks: Array.isArray(G.dropMarks) ? G.dropMarks.length : null,
                roadLines: Array.isArray(G.roadLines) ? G.roadLines.length : null
            },
            keysReadable: !!G.keys,
            keysWritable,
            gameTime: G.gameTime, killCount: G.killCount, money: G.money,
            field: fieldSize(),
            apiPresent: api.filter(hasGame),
            apiMissing: api.filter(n => !hasGame(n)),
            pool: (readPool() || []).map(c => ({ n: nameOf(c), type: c && c.type, lv: c && c.lv, maxlv: c && c.maxlv })),
            build: primaryCocktail,
            picks: runPicks,
            pickAudit,   // each recent selection: what won, its score, WHY, and what it beat
            lastRunStats,
            enemyMix: Object.fromEntries(Object.entries(enemyMix).map(([k, v]) => [k, +v.toFixed(1)])),
            scaling: {
                killRate: +killRate.toFixed(2), pressure: +pressureAvg.toFixed(2),
                toughness: +toughnessAvg.toFixed(2), dpsDeficit: +dpsDeficit.toFixed(2)
            },
            milestones: { supers: supersThisRun, crafts: craftsThisRun, rainbow: rainbowThisRun, dayCleared: dayClearedThisRun },
            lastPlan: lastPlan && lastPlan.diag,
            learning: {
                runs: learn.runs, totalPicks: learn.totalPicks, baseline: baseline(),
                hallOfFame: learn.hof.map(h => ({ mean: +h.r.toFixed(3), n: h.n || 1, best: +(h.best || h.r).toFixed(3) })),
                hofDistinct: learn.hof.length,
                sigmaAtFloor: +sigmasAtFloor().toFixed(2),
                restarts: (learn.cem && learn.cem.restarts) || 0,
                stalledGens: (learn.cem && learn.cem.stall) || 0,
                championRun,
                improvementCurve: learn.genHistory.slice(-12),
                lastGradient: learn.lastGradient || null,
                cem: {
                    generation: learn.cem.gen,
                    batch: learn.cem.batch.length + '/' + CONFIG.learning.batchSize,
                    mean: Object.fromEntries(Object.entries(learn.cem.mean).map(([k, v]) => [k, +v.toFixed(3)])),
                    explorationPct: Object.fromEntries(Object.entries(learn.cem.sigma).map(([k, v]) => {
                        const s = TUNABLE[k]; return [k, +((v / (s.max - s.min)) * 100).toFixed(0)];
                    })),
                    // CMA-ES-lite state: adaptive step size + strongest
                    // evolution-path directions (correlated-move memory)
                    stepSize: +(isFinite(learn.cem.ss) ? learn.cem.ss : 1).toFixed(3),
                    evolutionPath: Object.entries(learn.cem.pc || {})
                        .filter(([k, v]) => Math.abs(v) > 0.15)
                        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6)
                        .map(([k, v]) => k + (v > 0 ? ' +' : ' ') + v.toFixed(2))
                },
                contextualBandit: {
                    cardsTracked: Object.keys(learn.linucb || {}).length,
                    samples: +Object.values(learn.linucb || {}).reduce((a, m) => a + (m.n || 0), 0).toFixed(0)
                },
                rainbowPolicy: Object.fromEntries(Object.entries(learn.rainbowPolicy || {}).map(([k, v]) =>
                    [k, { n: +v.n.toFixed(1), mean: +(v.sum / Math.max(1e-9, v.n)).toFixed(3) }])),
                measuredSpawnTimetable: Object.fromEntries(Object.entries(learn.spawnIntel || {})
                    .filter(([k, v]) => v.n >= 1)
                    .map(([k, v]) => [k, { n: +v.n.toFixed(1), firstSeenS: Math.round(v.sum / v.n) }])),
                builds: learn.builds,
                rosterExperiment: {
                    enabled: !!CONFIG.rosterExperiment,
                    active: activeRoster,
                    results: Object.fromEntries(Object.entries(learn.rosters || {}).map(([k, v]) =>
                        [k, { runs: +v.n.toFixed(1), mean: +(v.sum / Math.max(1e-9, v.n)).toFixed(3) }]))
                },
                versionSnapshots: (learn.snapshots || []).map(s => s.version + ' (' + (s.runs == null ? 'seeded' : s.runs + ' runs') + ')'),
                lastDeathCause
            },
            moveSource, lastAction, stopReason, lastGiveUp
        };
        console.log('%c[PineBot] DIAGNOSTICS', 'font-weight:bold;color:#ffd98a', report);
        showReport(report);
        return report;
    }

    // ── v6.113.0 THE REPORT IS THE PRODUCT, AND IT LIED ABOUT COPYING ───────
    //
    // USER: "I want this all done by the report on the UI overlay. Everything
    // you need should not require things from the console."
    //
    // The 📋 button has existed since 6.8x and the user still pastes from the
    // console, which the release-state doc calls "the slow part of every
    // session". Reading the old handler says why:
    //
    //     copy.onclick = () => { try { navigator.clipboard.writeText(...);
    //                                  copy.textContent = 'copied'; } catch(e){} }
    //
    // `writeText` is ASYNC. It returns a promise, and a rejection — denied
    // permission, an unfocused document, a non-secure context — never reaches
    // that catch. The label was set on the next synchronous line regardless.
    // So the button said "copied" every single time, including the times
    // nothing was on the clipboard. A silent failure that reports success is
    // worse than a loud one: it sends you to the console without ever saying
    // it failed.
    //
    // Three fixes, in order of how much they matter:
    //   1. TELL THE TRUTH. Await the promise; fall back to execCommand on a
    //      real <textarea>; if even that fails, select the text and say
    //      "press ⌘C" — never claim a copy that did not happen.
    //   2. <textarea>, not <pre>. A pre cannot be .select()ed, so there was no
    //      manual path at all when the clipboard was unavailable. A readonly
    //      textarea gives one, and renders 200 KB far faster.
    //   3. A HUMAN SUMMARY ON TOP. The point of an overlay report is to be
    //      read, not only shipped. The headline numbers now render above the
    //      JSON so the run state is legible without copying anything.
    function reportSummary(r) {
        // Pure function of the report object — no DOM, no globals — so it is
        // testable and so the panel and the console print the same thing.
        const L = [];
        const n = v => (v == null ? '—' : v);
        const pct = v => (v == null ? '—' : Math.round(v * 100) + '%');
        try {
            // v6.114.0: `compare.current` is a STRING ("6.113.0+crown+joe"),
            // not a row. The first draft read `.version`/`.n` off it and the
            // header rendered "v—  —  n=—" on the very first live paste. The
            // row lives in compare.versions; find it by that string.
            const cmp = (r && r.compare) || {};
            const curId = typeof cmp.current === 'string' ? cmp.current : null;
            const vers = Array.isArray(cmp.versions) ? cmp.versions : [];
            const cur = (curId && vers.filter(v => v && v.version === curId)[0]) ||
                        (typeof cmp.current === 'object' && cmp.current) || {};
            L.push('v' + n(curId || cur.version) +
                (STORE_NS ? '  ns=' + STORE_NS.slice(1) : '  ns=(bare)') +
                '  n=' + n(cur.runs != null ? cur.runs : cur.n) +
                '  gen=' + n(r && r.learning && r.learning.gen) +
                '  runs=' + n(r && r.learning && r.learning.runs));
            const g = (r && r.funnel && r.funnel.groups && r.funnel.groups[0]) || {};
            L.push('FUNNEL  day ' + n(g.dayClearRate) + '   entry ' + n(g.entrySurvival) +
                '   deepHeld ' + n(g.deepHeldRate) + '   seated ' + n(g.seatedRate));
            L.push('BUILD   ready ' + n(g.buildsReady) + '@' + n(g.medianReadyAt) +
                '   supers/run ' + n(cur.supersPerRun) +
                '   entryDef ' + n(g.medianEntryDef) + '   entryRegen ' + n(g.medianEntryRegen));
            L.push('DEEP    at ' + n(g.medianDeepAt) + '   bestHold ' + n(g.medianDeepHold) + 's' +
                '   still ' + n(g.medianDeepStill) + '%   ult ' + n(g.medianDeepInv) + '%   hp ' + n(g.medianDeepHp));
            if (g.holds) L.push('        holds ' + n(g.holds) + '  median ' + n(g.medianHold) + 's  max ' + n(g.maxHold) +
                's  broke-by ' + (g.deepBreak ? Object.keys(g.deepBreak).map(k => k + ':' + g.deepBreak[k]).join(' ') : '-'));
            // v6.116.0: the seat census. The line that says what is standing
            // between "in hell" and "anchored", sorted biggest-first — which
            // is the version-to-version target while deepHeldRate is 0.
            if (g.seatShare != null) {
                const ms = g.parkMiss || {};
                const mr = Object.keys(ms).map(k => [k, ms[k]]).sort((a, b) => b[1] - a[1]);
                const mt = mr.reduce((s, x) => s + x[1], 0) || 1;
                L.push('SEAT    held ' + n(Math.round(g.seatShare * 100)) + '% of hell   missed-by ' +
                    (mr.length ? mr.slice(0, 6).map(x => x[0] + ' ' + Math.round(x[1] / mt * 100) + '%').join('  ') : '-'));
            }
            L.push('SURVIVE median ' + n(cur.medianTimeS) + 's   mean ' + n(cur.meanTimeS) +
                's   hell ' + n(cur.hellRate) + '   caps ' + n(g.capOuts) + '/' + n(g.earlyCaps));
            // v6.125.0 THE IMMORTAL STOP RULE, one line: where each character
            // stands against the target bar (v6.126.0: a total, not a
            // streak; v6.128.0: ten, not five, and the count reset fresh),
            // and who the pin resolves to.
            const gr = r && r.graduation;
            if (gr && gr.enabled) {
                const st = gr.counts || gr.streaks || {}, gd = gr.graduated || {};
                // v6.131.0: the run cost is on the line too (user: "who
                // reached immortal build the fastest and with the fewest
                // runs"), so the race is readable without opening `race`.
                // `in N` = runs this epoch; for a graduate it is the run the
                // target actually landed on, which is the answer itself.
                const rc = {}; for (const x of (gr.race || [])) rc[x.char] = x;
                L.push('IMMORTAL ' + (gr.order || []).map(c => {
                    const x = rc[c], bar = n(gr.countNeeded != null ? gr.countNeeded : gr.streakNeeded);
                    const cost = x ? (x.runsTo != null ? ' in ' + x.runsTo : x.runs ? ' in ' + x.runs + '+' : '') : '';
                    return c + ' ' + (gd[c] ? '🎓' : n(st[c]) + '/' + bar) + cost;
                }).join('   ') + '   playing ' + n(gr.playing));
                if (gr.fewestRuns || gr.fastestBuild) {
                    L.push('RACE   fewest runs ' + n(gr.fewestRuns) + '   fastest wall ' + n(gr.fastestWall) +
                        '   earliest cap ' + n(gr.fastestBuild) +
                        '   [' + (gr.race || []).map(x => x.char + ' ' + x.immortal + '/' + x.runs +
                            (x.medianCapAt != null ? ' cap' + x.medianCapAt : '')).join(' | ') + ']');
                }
            }
            // v6.114.0 THE HP ECONOMY, promoted to the headline. The income
            // audit's first bucket is the single most diagnostic number in the
            // report and it was buried: a negative net at minute 0 means the
            // pool drains from the start and no amount of movement tuning can
            // fix it. `firstNeg` is the first depth at which the bot is losing.
            const inc = (r && r.income && r.income.buckets) || [];
            if (inc.length) {
                const b0 = inc[0] || {};
                L.push('HP NET  0-10min ' + (b0.net > 0 ? '+' : '') + n(b0.net) + ' HP/s  (loss ' + n(b0.lossPerSec) +
                    ' gain ' + n(b0.gainPerSec) + ')   firstNegative@' + n(r.income.firstNegativeMin) + 'min' +
                    (b0.net < 0 ? '   <-- DRAINING FROM MINUTE ZERO' : ''));
            }
            // deaths, biggest first — the line that says what to fix next
            const d = (r && r.funnel && r.funnel.groups && r.funnel.groups[0] && r.funnel.groups[0].deaths) || null;
            const dmg = (r && r.damage && r.damage.sole) || null;
            if (dmg) {
                const rows = Object.keys(dmg).map(k => [k, dmg[k].n || 0]).sort((a, b) => b[1] - a[1]);
                const tot = rows.reduce((s, x) => s + x[1], 0) || 1;
                L.push('DAMAGE  ' + rows.slice(0, 5).map(x => x[0] + ' ' + Math.round(x[1] / tot * 100) + '%').join('  '));
            } else if (d) {
                L.push('DEATHS  ' + Object.keys(d).map(k => k + ' ' + d[k]).join('  '));
            }
            // the two v6.111/112 instruments, so a row that is not moving says so
            L.push('LANES   in ' + n(g.laneIn) + '  divert ' + n(g.laneDiv) +
                '        ULT  invAll ' + n(g.medianInvAll) + '  casts ' + n(g.medianCasts) + '  cdMul ' + n(g.medianCdMul));
            // v6.118.0: the craft prompt, one line. The user reports BLACK
            // VERMOUTH never triggering; this says which half of the chain.
            const cr = r && r.craft;
            if (cr && (cr.ready || cr.seen)) {
                L.push('CRAFT   owed ' + n(cr.ready) + '  promptSeen ' + n(cr.seen) +
                    '  clicked ' + n(cr.clicked) + '  confirmed ' + n(cr.confirmed) +
                    (cr.ready > 100 && !cr.seen ? '   <-- OWED BUT NEVER PROMPTED' : '') +
                    (cr.seen && !cr.clicked ? '   <-- PROMPTED BUT NO SELECTOR MATCHED' : ''));
            }
            const bk = (r && r.boss && r.boss.kinds) || [];
            if (bk.length) {
                L.push('BOSS    ' + bk.slice(0, 4).map(k =>
                    k.kind + ' n' + k.n + ' @' + n(k.firstGt) + ' r' + n(k.r0) + ' ring@' + n(k.ringAt)).join('  |  '));
            } else {
                L.push('BOSS    census empty — run a batch on 6.112.0+');
            }
            // CEM dimensions pinned against a bound, which is the thing that
            // most often explains a flat row and is invisible in the numbers.
            const par = (r && r.learning && r.learning.params) || {};
            const edge = Object.keys(par).filter(k => par[k] && par[k].atEdge);
            if (edge.length) L.push('AT EDGE ' + edge.map(k => k.split('.').pop() + ':' + par[k].atEdge).join('  '));
            // v6.117.0: `reopen` is `cem.lastReopen` — a DURABLE record of the
            // last migration, not an event on this load. The old wording said
            // "re-opened this load" and would have had the next reader chasing
            // a phantom restart 3,400 runs after the fact. Print WHEN.
            const reop = r && r.learning && r.learning.reopen;
            if (reop && reop.dims && reop.dims.length) {
                const now = (r && r.learning && r.learning.runs) || 0;
                const ago = reop.runs != null ? (now - reop.runs) : null;
                L.push('REOPEN  last box re-open: ' + reop.dims.length + ' dim(s) at run ' + n(reop.runs) +
                    (ago != null ? '  (' + ago + ' runs ago)' : '') +
                    (ago != null && ago > 200 ? '  — history, not this load' : ''));
            }
        } catch (e) {
            L.push('(summary failed: ' + (e && e.message) + ')');
        }
        void pct;
        return L.join('\n');
    }

    //
    // v6.125.0 THE REPORT OUTGREW THE PROMPT.
    //
    // USER: "it is saying the prompt is too long now" / "from the copy
    // report". The 📋 button is the product, and the product stopped
    // fitting in the thing it exists to be pasted into. That is a
    // total failure of the instrument regardless of how good the data
    // is, and it will recur every time an audit is added — so the fix
    // is a BUDGET, enforced at copy time, not a one-off trim.
    //
    // Three separate causes, in descending size:
    //
    //   1. The clipboard carried `JSON.stringify(r, null, 2)`. Two
    //      spaces of indent per level on an object this deeply nested
    //      is roughly HALF the payload and carries no information.
    //      The overlay textarea keeps the pretty form (a human reads
    //      that); the clipboard gets the compact one.
    //   2. `phases` is up to 240 raw per-run rows of ~35 fields, and
    //      most fields are null on most rows (deepAt/deepStill/
    //      deepInv/deepHp/deepHolds/deepBreak/why/capAt/readyAt/hEnt/
    //      seat/def/regen/ultLv/cdMul/ultMax/ult6At are all null on
    //      any run that died in the day, which is most of them).
    //   3. `compare.versions[].top` is five full run records per
    //      version across ~45 versions, and nothing reads them except
    //      the current row.
    //
    // WHAT IS DROPPED AND WHAT IS NOT. Only `null` values are stripped
    // from rows — never 0 and never false. This project's own rule is
    // that "a key that vanishes reads as no data rather than wrong
    // accessor", and `null` ALREADY reads as no data, so removing it
    // loses nothing; removing a 0 would turn a measured zero into a
    // missing measurement, which is how `deaths.line` and the early
    // cap were both misread. `r.trimmed` names every step that fired,
    // so a reader always knows which shape they are holding.
    //
    // `r.sizes` reports each section's own compact KB. The point is
    // that the NEXT time this bites, the report says which section
    // grew instead of the paste just failing.
    const REPORT_BUDGET_KB = 60;
    const jKB = o => { try { return +(JSON.stringify(o).length / 1024).toFixed(1); } catch (e) { return null; } };
    const dropNulls = row => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
        const o = {};
        for (const k of Object.keys(row)) if (row[k] !== null && row[k] !== undefined) o[k] = row[k];
        return o;
    };
    function trimReport(r, budgetKB) {
        const did = [];
        const over = () => (jKB(r) || 0) > budgetKB;
        // — free steps: always run, no information lost —
        if (Array.isArray(r.phases) && r.phases.length) {
            r.phases = r.phases.map(dropNulls);
            did.push('phases: null-valued keys dropped (0/false kept)');
        }
        if (r.compare && Array.isArray(r.compare.versions)) {
            const cur = r.compare.current;
            let n = 0;
            for (const v of r.compare.versions) {
                if (v.version !== cur && v.top) { delete v.top; n++; }
            }
            r.compare.versions = r.compare.versions.map(dropNulls);
            if (n) did.push('compare.versions[].top dropped on ' + n + ' non-current rows');
        }
        for (const [sec, empty] of [['income', b => !b.dtS], ['mark', b => !b.n]]) {
            const s = r[sec];
            if (!s || !Array.isArray(s.buckets)) continue;
            const before = s.buckets.length;
            s.buckets = s.buckets.filter(b => !empty(b)).map(dropNulls);
            if (s.buckets.length < before) did.push(sec + '.buckets: ' + (before - s.buckets.length) + ' empty buckets dropped');
        }
        // — budgeted steps: only as far as the budget requires —
        if (over() && Array.isArray(r.picks) && r.picks.length > 15) {
            r.picks = r.picks.slice(-15); did.push('picks: last 15 only');
        }
        if (over() && Array.isArray(r.phases)) {
            for (const keep of [80, 40, 20, 10]) {
                if (!over()) break;
                if (r.phases.length <= keep) continue;
                r.phases = r.phases.slice(-keep);
                did.push('phases: last ' + keep + ' rows only (funnel aggregates all of them)');
            }
        }
        if (over() && Array.isArray(r.phases) && r.phases.length) {
            // EMPTIED, not nulled. `null` is this project's signature
            // for a broken accessor (overlay-report asserts the shape
            // for exactly that reason); an empty array beside a
            // `trimmed` step that names the drop cannot be confused
            // with an audit that failed to read.
            r.phases = [];
            did.push('phases: DROPPED ENTIRELY (emptied, not nulled) — read funnel instead, it is the aggregation of the same rows');
        }
        r.sizes = safe(() => {
            const out = {};
            for (const k of Object.keys(r)) if (k !== 'sizes' && k !== 'note' && k !== 'summary') out[k] = jKB(r[k]);
            out.TOTAL = jKB(r);
            return out;
        }, null);
        r.trimmed = did.length
            ? { budgetKB: budgetKB, steps: did, note: 'only null values were removed — every 0 and every false in this report is a MEASURED zero. pineBot.reportFull() returns the untrimmed object.' }
            : null;
        return r;
    }

    function showReport(report) {
        const old = document.getElementById('pineBotReport');
        if (old) old.remove();
        // v6.125.0 THE CLIPBOARD AND THE SCREEN WANT DIFFERENT THINGS. The
        // textarea is read by a human, so it keeps the indentation; the
        // clipboard is read by a model, which does not care and was paying
        // roughly half the payload for it. Same object, same keys, same
        // values — only the whitespace differs, and only the compact form is
        // what "prompt too long" was measuring.
        const pretty = (() => { try { return JSON.stringify(report, null, 2); } catch (e) { return '{}'; } })();
        const text = (() => { try { return JSON.stringify(report); } catch (e) { return '{}'; } })();
        const kb = Math.round(text.length / 1024);
        const el = document.createElement('div');
        el.id = 'pineBotReport';
        el.style.cssText = 'position:fixed;left:10px;top:10px;right:250px;max-height:80vh;overflow:auto;z-index:2147483647;' +
            'background:rgba(10,10,14,.97);color:#cfe;font:10px/1.4 ui-monospace,monospace;padding:10px;border-radius:8px;border:1px solid #3a3a46';

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px';
        const mk = (label, title) => {
            const b = document.createElement('button');
            b.textContent = label; b.title = title || '';
            b.style.cssText = 'cursor:pointer;font:11px ui-monospace,monospace;padding:3px 9px;border-radius:5px;' +
                'border:1px solid #4a4a58;background:rgba(255,255,255,.09);color:#ffd98a';
            return b;
        };
        const ta = document.createElement('textarea');
        ta.readOnly = true;
        ta.value = pretty;   // v6.125.0: the human reads the indented form
        ta.style.cssText = 'width:100%;height:46vh;background:rgba(0,0,0,.5);color:#cfe;border:1px solid #333;' +
            'border-radius:6px;font:10px/1.35 ui-monospace,monospace;padding:6px;resize:vertical';

        const copy = mk('📋 copy report (' + kb + ' KB)',
            'Copies the whole report as COMPACT JSON (' + kb + ' KB; the box above shows the indented '
            + Math.round(pretty.length / 1024) + ' KB form). Paste it straight to Claude.');
        const say = (msg, good) => { copy.textContent = msg; copy.style.color = good ? '#9f9' : '#f99'; };
        // The honest chain: clipboard API -> execCommand on the textarea ->
        // select and tell the user to press the key. Each step only claims
        // success after it has actually happened.
        copy.onclick = () => {
            // Each step guarded SEPARATELY. One try block around the lot meant
            // a throwing select() — an older engine, a detached node — skipped
            // execCommand entirely and lost the last working copy path. The
            // selection is a nicety; the execCommand call is the fallback, and
            // it must be attempted even when the selection could not be made.
            const viaExec = () => {
                try { ta.readOnly = false; } catch (e) { }
                try { if (ta.select) ta.select(); } catch (e) { }
                try { if (ta.setSelectionRange) ta.setSelectionRange(0, text.length); } catch (e) { }
                let ok = false;
                try { ok = !!(document.execCommand && document.execCommand('copy')); } catch (e) { }
                try { ta.readOnly = true; } catch (e) { }
                if (ok) { say('✓ copied — paste to Claude', true); return true; }
                return false;
            };
            let p = null;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) p = navigator.clipboard.writeText(text);
            } catch (e) { p = null; }
            if (p && typeof p.then === 'function') {
                p.then(() => say('✓ copied — paste to Claude', true))
                 .catch(() => { if (!viaExec()) { try { ta.select(); } catch (e) { } say('press ⌘C / Ctrl+C now', false); } });
            } else if (!viaExec()) {
                try { ta.select(); } catch (e) { }
                say('press ⌘C / Ctrl+C now', false);
            }
        };
        const sel = mk('select all', 'Select the text so you can copy it by hand');
        sel.onclick = () => { try { ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); } catch (e) { } };
        const close = mk('close', 'Close this overlay');
        close.onclick = () => el.remove();
        bar.appendChild(copy); bar.appendChild(sel); bar.appendChild(close);

        const sum = document.createElement('pre');
        sum.textContent = reportSummary(report);
        sum.style.cssText = 'margin:0 0 8px;padding:8px;background:rgba(255,217,138,.07);border-left:2px solid #ffd98a;' +
            'color:#ffe7b8;font:11px/1.5 ui-monospace,monospace;white-space:pre;overflow-x:auto';

        el.appendChild(bar);
        el.appendChild(sum);
        el.appendChild(ta);
        document.body.appendChild(el);
        // Pre-select on open: even if every clipboard path is blocked, one
        // keystroke ships the report. This is the fallback that makes the
        // console unnecessary rather than merely inconvenient.
        try { ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); } catch (e) { }
    }

    // =================================================================
    // DEMO RECORDER — records the USER'S manual runs (bot stopped) as a
    // behavioral reference: positions vs targets, dodge timing, ult/dash
    // usage, and every level-up choice with the pool it was chosen from.
    // Stored in localStorage 'pineBotDemos' (last 4 runs) for analysis.
    // =================================================================
    let demoRec = null;
    function demoToggle() {
        if (demoRec) { demoSave(); return; }
        demoRec = { at: Date.now(), samples: [], events: [] };
        try {
            if (!window.__demoWrapped) {
                window.__demoWrapped = true;
                const wrap = (fn, tag) => {
                    const orig = window[fn];
                    if (typeof orig !== 'function') return;
                    window[fn] = function () {
                        if (demoRec) demoRec.events.push({ t: Date.now() - demoRec.at, e: tag,
                            gt: Math.round(safe(() => gameTime, 0) || 0),
                            a: tag === 'pick' ? [arguments[0], (readPool() || []).map(c => nameOf(c))] : undefined });
                        return orig.apply(this, arguments);
                    };
                };
                wrap('pickUpgrade', 'pick'); wrap('useUltimate', 'ult'); wrap('tryDash', 'dash');
            }
        } catch (e) { }
        setStatus('🎥 RECORDING your manual play — press 🎥 again to save');
    }
    function demoSave() {
        if (!demoRec) return;
        try {
            const all = JSON.parse(localStorage.getItem('pineBotDemos') || '[]');
            all.push({ at: demoRec.at, n: demoRec.samples.length, samples: demoRec.samples, events: demoRec.events });
            while (all.length > 4) all.shift();
            // v6.96.2 SIZE CAP. "Last 4 runs" was the only bound, and four
            // 20-minute demos measured 2.66 MB — 91% of the bot's whole
            // storage footprint, crowding the quota every learn-store save
            // has to fit under. Bytes, not count, are the real budget: drop
            // oldest demos until the blob fits, and if a SINGLE demo is over
            // the cap, thin its sample ring (every 2nd sample; the digest's
            // percentiles barely move) rather than refuse the save.
            const demoCap = (CONFIG.learning && CONFIG.learning.demoCapBytes) || 900000;
            let demoBlob = JSON.stringify(all);
            while (all.length > 1 && demoBlob.length > demoCap) { all.shift(); demoBlob = JSON.stringify(all); }
            while (demoBlob.length > demoCap && all.length === 1 && (all[0].samples || []).length > 500) {
                all[0].samples = all[0].samples.filter((_, i) => i % 2 === 0);
                all[0].thinned = (all[0].thinned || 0) + 1;
                demoBlob = JSON.stringify(all);
            }
            localStorage.setItem('pineBotDemos', demoBlob);
            setStatus('🎥 saved demo: ' + demoRec.samples.length + ' samples, ' + demoRec.events.length + ' events');
            demoRec = null;
            showReport(demoDigest());   // v6.86.3: the digest is what gets pasted to Claude
            return;
        } catch (e) { setStatus('demo save failed: ' + e.message); }
        demoRec = null;
    }
    // v6.86.3 DEMO DIGEST. A 20-minute demo is ~9k samples — far too big to
    // hand over. The questions a teaching demo has to answer are few, so the
    // analysis runs HERE and emits a few KB: how close the human stands to a
    // passout, whether an ultimate actually clears one, when the first super
    // and the armour levels land, and what HP they accept before backing off.
    function demoDigest(idx) {
        let all = [];
        try { all = JSON.parse(localStorage.getItem('pineBotDemos') || '[]'); } catch (e) { }
        const d = all[idx == null ? all.length - 1 : idx];
        if (!d || !d.samples || !d.samples.length) return { error: 'no demo recorded yet — press 🎥, play a run, press 🎥 again' };
        const S = d.samples, E = d.events || [];
        const pct = (a, q) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };
        const at = gt => { let best = null, bd = 1e9; for (const s of S) { const dd = Math.abs((s.gt || 0) - gt); if (dd < bd) { bd = dd; best = s; } } return best; };
        const firstWhere = f => { for (const s of S) if (f(s)) return s.gt; return null; };
        // where does the human STAND while farming a passout?
        const near200 = S.filter(s => s.poD != null && s.poD < 200).map(s => s.poD);
        // did an ultimate clear a passout? compare the nearest body's HP 3s later
        const ults = E.filter(e => e.e === 'ult').map(e => {
            const a = at(e.gt), b = at(e.gt + 3);
            return { gt: e.gt, ultLv: a ? a.ulv : null, poD: a ? a.poD : null,
                     poHpBefore: a ? a.poHp : null, poHpAfter: b ? b.poHp : null,
                     poCountBefore: a ? a.poN : null, poCountAfter: b ? b.poN : null };
        });
        const hurt = S.filter(s => s.near >= 3).map(s => s.hp);
        // v6.86.6: the day and the deep game are different problems — the
        // 90-minute demo fired 13 of 14 recorded casts with ZERO passouts on
        // the floor, stood in crowds of 18-220 at 100% HP and never dashed,
        // while the day demos lived at 79-82px off a passout with crowd p75
        // of 0-1. Pooling those into one set of percentiles hides both.
        const phaseOf = s => (s.gt < 1200 ? 'day' : (s.gt < 3600 ? 'hell' : 'deep'));
        const phases = {};
        for (const key of ['day', 'hell', 'deep']) {
            const P = S.filter(s => phaseOf(s) === key);
            if (!P.length) continue;
            const po = P.filter(s => s.poD != null && s.poD < 200).map(s => s.poD);
            phases[key] = {
                samples: P.length, fromGt: P[0].gt, toGt: P[P.length - 1].gt,
                passoutStationMedian: pct(po, 0.5), passoutSamples: po.length,
                passoutsOnFieldMax: Math.max(...P.map(s => s.poN || 0)),
                hpP10: pct(P.map(s => s.hp), 0.1), hpMedian: pct(P.map(s => s.hp), 0.5),
                crowdMedian: pct(P.map(s => s.near), 0.5), crowdP75: pct(P.map(s => s.near), 0.75),
                crowdMax: Math.max(...P.map(s => s.near || 0)),
                ults: E.filter(e => e.e === 'ult' && phaseOf({ gt: e.gt }) === key).length,
                dashes: E.filter(e => e.e === 'dash' && phaseOf({ gt: e.gt }) === key).length
            };
        }
        const lvAt = k => { const out = {}; for (const s of S) { const v = s[k] || 0; if (v && out[v] == null) out[v] = s.gt; } return out; };
        return {
            note: 'MANUAL DEMO DIGEST — paste this to Claude',
            version: scriptTag(), char: safe(() => player.key, null),
            durationS: Math.round((S[S.length - 1].gt || 0) - (S[0].gt || 0)),
            reachedGt: S[S.length - 1].gt, samples: S.length,
            passoutStation: {
                note: 'distance to the NEAREST passout while one is within 200px',
                p10: pct(near200, 0.1), p25: pct(near200, 0.25), median: pct(near200, 0.5),
                p75: pct(near200, 0.75), samples: near200.length,
                shareUnder60px: +(S.filter(s => s.poD != null && s.poD < 60).length / S.length).toFixed(3),
                everOnField: Math.max(...S.map(s => s.poN || 0))
            },
            recordingStartedGt: S[0].gt,   // >0 means the recording began mid-run
            byPhase: phases,               // day <20min | hell 20-60 | deep 60min+
            ultimates: { count: ults.length, uses: ults.slice(0, 40) },
            build: {
                firstSuperGt: firstWhere(s => (s.sup || 0) >= 1),
                supersAtEnd: S[S.length - 1].sup || 0,
                ultLevelReached: Math.max(...S.map(s => s.ulv || 0)),
                ultLevelTimeline: lvAt('ulv'),
                oliveTimeline: lvAt('ol'), negroniTimeline: lvAt('ng'),
                picks: E.filter(e => e.e === 'pick').map(e => ({ gt: e.gt,
                    took: (e.a && Array.isArray(e.a[1])) ? e.a[1][e.a[0]] : null })).slice(0, 60)
            },
            posture: {
                flameShare: +(S.reduce((n, s) => n + (s.fx || 0), 0) / S.length).toFixed(3),
                // v6.88.2 — the two numbers that would have prevented this
                // session's two wrong conclusions. invulnShare is measured
                // invulnerability, not `useUltimate` call count. cornerDist is
                // distance to the nearest arena corner: p25/median/p75, so the
                // corner posture can be read off a demo instead of a screenshot.
                invulnShare: +(S.reduce((n, s) => n + (s.inv || 0), 0) / S.length).toFixed(3),
                cornerDist: {
                    p25: pct(S.map(s => s.cnr).filter(v => v != null), 0.25),
                    median: pct(S.map(s => s.cnr).filter(v => v != null), 0.5),
                    p75: pct(S.map(s => s.cnr).filter(v => v != null), 0.75)
                },
                hpP10: pct(S.map(s => s.hp), 0.1), hpMedian: pct(S.map(s => s.hp), 0.5),
                hpMedianWhenCrowded: pct(hurt, 0.5), crowdedSamples: hurt.length,
                crowdP75: pct(S.map(s => s.near), 0.75), crowdMax: Math.max(...S.map(s => s.near || 0)),
                dashes: E.filter(e => e.e === 'dash').length
            },
            // v6.109.0 THE FINAL STATE — the point of a recording that STOPS
            // at corner anchoring. Everything above is a distribution over the
            // whole run; this is the single snapshot that says what the
            // immortal build actually was, and when it arrived.
            final: (() => {
                const L = S[S.length - 1], tail = S.slice(-Math.min(60, S.length));
                const pctT = q => pct(tail.map(x => x.cnr).filter(v => v != null), q);
                return {
                    gt: L.gt,                                   // time to immortality
                    def: L.def, regen: L.rgn, ultLv: L.ulv, supers: L.sup,
                    weapons: L.w || null, passives: L.pas || null,
                    // the anchoring claim, checked rather than asserted:
                    // corner distance and HP over the final stretch
                    tailCornerDist: { p25: pctT(0.25), median: pctT(0.5), p75: pctT(0.75) },
                    tailHpMedian: pct(tail.map(x => x.hp), 0.5),
                    tailInvulnShare: +(tail.reduce((n, x) => n + (x.inv || 0), 0) / tail.length).toFixed(3),
                    tailCrowdMedian: pct(tail.map(x => x.near), 0.5)
                };
            })()
        };
    }

    function demoTick() {
        if (!demoRec) return;
        const p = G.player; if (!p || G.state !== 'playing') return;
        const en = Array.isArray(G.enemies) ? G.enemies.filter(Boolean) : [];
        const fr = safe(() => frame, 0) || 0;
        let poD = null, bossD = null, wallD = null, near = 0, poHp = null, poN = 0;
        let frozenBossD = null, frozenN = 0, hpSum = 0, hpN = 0;
        const globalStop = typeof p.timeStopUntil === 'number' && p.timeStopUntil > fr;
        for (const e of en) {
            const dd = hyp(e.x - p.x, e.y - p.y);
            const ty = String(e.type), bc = String(e.bossChar || '');
            // v6.88.0 AUDIT R3: a TIME STOP item sets player.timeStopUntil
            // ONLY; frozenUntil is WHISKY SOUR's per-enemy freeze. The planner
            // was fixed to OR the two; demoTick was not — so every manual demo
            // recorded frz: 0, and the "how close does the human stand to a
            // PAUSED boss?" measurement that calibrated stopBossPull /
            // stopStation / the burn station was structurally zero in all of
            // them. Same class as the flameShare units bug.
            const froz = globalStop || (typeof e.frozenUntil === 'number' && e.frozenUntil > fr);
            if (froz) frozenN++;
            if (ty === 'passout') {
                poN++;
                if (poD == null || dd < poD) { poD = Math.round(dd); poHp = Math.round(e.hp || 0); }
                continue;
            }
            if (/nobook/i.test(bc + ty)) { if (wallD == null || dd < wallD) wallD = Math.round(dd); }
            else if (ty === 'boss') {
                if (bossD == null || dd < bossD) bossD = Math.round(dd);
                // STALL DOCTRINE: how close does the user get to a PAUSED boss?
                if (froz && (frozenBossD == null || dd < frozenBossD)) frozenBossD = Math.round(dd);
            }
            if (typeof e.hp === 'number' && ty !== 'boss' && ty !== 'passout') { hpSum += e.hp; hpN++; }
            if (dd < 90) near++;
        }
        // v6.88.2: two measurements the digest could never make. `cnr` is the
        // distance to the nearest arena corner — the corner hypothesis was
        // argued from geometry and a screenshot because x/y were recorded but
        // never summarised. `inv` is real invulnerability, which is how we
        // learned that 2174 logged `ults` were CALLS (most rejected) against a
        // 53.3 s cooldown, not casts.
        const fW = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
        const fH = (typeof G.H === 'number' && G.H > 0) ? G.H : CONFIG.field.h;
        const gtD = safe(() => gameTime, 0) || 0;
        const cnr = Math.round(hyp(Math.min(p.x, fW - p.x), Math.min(p.y, fH - p.y)));
        const inv = ((typeof p.ultSpiralUntil === 'number' && p.ultSpiralUntil > gtD) ||
                     (typeof p.ultUntil === 'number' && p.ultUntil > gtD) ||
                     (typeof p.invuln === 'number' && p.invuln > 0)) ? 1 : 0;
        demoRec.samples.push({
            cnr, inv,
            t: Date.now() - demoRec.at, gt: Math.round(safe(() => gameTime, 0) || 0),
            x: Math.round(p.x), y: Math.round(p.y),
            hp: Math.round(100 * (p.hp / (p.maxHp || 1))),
            poD, bossD, wallD, near,
            marks: Array.isArray(G.dropMarks) ? G.dropMarks.filter(Boolean).length : 0,
            // stall-doctrine signals
            fbD: frozenBossD,                                    // distance to nearest PAUSED boss
            frz: frozenN,                                        // how many enemies are frozen (pause active?)
            slow: typeof p.slowMul === 'number' ? +p.slowMul.toFixed(2) : 1,   // freeze-aura exposure
            mobHp: hpN ? Math.round(hpSum / hpN) : 0,            // scaling proxy for ult-trigger tuning
            // v6.86.7: seconds, not frames — this is why every demo read flameShare 0
            fx: typeof p.fireCrossUntil === 'number' && p.fireCrossUntil > (safe(() => gameTime, 0) || 0) ? 1 : 0,
            // v6.86.3 — the build state, so a demo answers WHY the play worked
            poHp: poHp, poN: poN,                                // nearest passout HP + how many on the floor
            ulv: p.ultLevel || 0,
            ur: (safe(() => gameTime, 0) || 0) >= (p.ultReadyAt || 0) ? 1 : 0,
            sup: Object.keys(p.superLv || {}).length,
            ol: (p.weapons || {}).olive || 0, ng: (p.weapons || {}).negroni || 0,
            // v6.109.0 — THE IMMORTAL-BUILD RECORDING. The user records to the
            // moment of corner anchoring and stops, per character, so the LAST
            // sample is the answer: this is what an immortal build is made of.
            // def and rgn are recorded because the bot's own stability proof
            // gates on them (capStable.defMin 34.9, and the whole armour
            // doctrine) using numbers derived from source reading, never from
            // a human's actual immortal build.
            def: typeof p.defense === 'number' ? +p.defense.toFixed(1) : null,
            rgn: typeof p.regenBonus === 'number' ? +p.regenBonus.toFixed(2) : null,
            // full owned levels, so the final sample names the recipe rather
            // than leaving it to be reconstructed from a 60-pick cap
            w: Object.assign({}, p.weapons || {}), pas: Object.assign({}, p.passives || {})
        });
        if (demoRec.samples.length > 9000) demoSave();   // ~24 min cap: autosave
    }

    // =================================================================
    // BOOT
    // =================================================================
    function boot() {
        buildPanel();
        applyParams(bestParams());
        saveLearn();   // persist the version-change freeze (and the 6.74.0 seed) immediately
        try {
            window.pineBot = {
                start: startBot, stop: stopBot, diagnose, reset: resetLearn,
                // v6.104.0: the panel's ⏻ End Run, callable from the console.
                // Latches the early cap so the tested ladder ends the run and
                // the farm restarts; endRun() below books but STOPS the bot.
                killNow,
                // v6.104.0: show/hide the overlay without touching the mouse
                panel: on => { setPanelHidden(on === false); return on === false ? 'hidden' : 'shown'; },
                config: CONFIG, learn: () => learn, plan: () => lastPlan, state: () => G.state,
                version: SCRIPT_VERSION, tag: scriptTag(),
                // v6.124.0 THE STORE NAMESPACE. pineBot.namespace('claude')
                // suffixes every key this bot owns, copies the bare keys over
                // once, and reloads so the boot-time constants pick it up.
                // pineBot.namespace() reads it; pineBot.namespace('') clears
                // it (the bare keys were never deleted, so this is lossless).
                namespace: (v) => {
                    if (v === undefined) return STORE_NS ? STORE_NS.slice(1) : '';
                    const clean = String(v || '').replace(/[^\w-]/g, '');
                    try {
                        if (clean) localStorage.setItem(STORE_NS_META, clean);
                        else localStorage.removeItem(STORE_NS_META);
                    } catch (e) { return 'localStorage refused: ' + (e && e.message); }
                    try { setTimeout(() => { try { location.reload(); } catch (e) { } }, 250); } catch (e) { }
                    return clean ? 'namespace set to "' + clean + '" — reloading; the bare keys are copied on the next boot'
                        : 'namespace cleared — reloading onto the bare keys';
                },
                // VERSION SNAPSHOTS
                compare: versionComparison,            // every version side by side, with deltas
                // v6.95.2 (user: "I can't die on this run without purposefully
                // overriding the bot... what should I do to save the data
                // while killing the bot on my own?"): book the run NOW with a
                // live snapshot, then stop driving — the user is free to die,
                // quit, or close the tab without losing the row.
                endRun: () => {
                    deathSnapshot = deathSnapshot || snapshotStats();
                    finishRun(); releaseAll(); stopBot('user-end');
                    return 'run booked + bot stopped — die or quit freely';
                },
                versions: versionReport,               // same table, best-time first (back-compat)
                restartSearch: () => restartSearch('manual'),   // v6.86.0: reopen the search by hand
                recenterSearch: () => recenterSearch('manual'),   // v6.98.0: mean back to defaults + sigma reopened + hof cleared — the ratchet repair
                demo: demoDigest,                      // pineBot.demo() — digest of the last 🎥 recording
                demoRaw: () => { try { return JSON.parse(localStorage.getItem('pineBotDemos') || '[]'); } catch (e) { return []; } },
                snapshot: snapshotNow,                 // freeze THIS version's rollup now
                noteVersion,                           // pineBot.noteVersion('6.74.0', { bestTimeS: 15150, note: '...' })
                table: () => { try { console.table(versionRows().map(r => ({ version: r.version, status: r.status, runs: r.runs, medianMin: r.medianTimeS == null ? null : +(r.medianTimeS / 60).toFixed(1), meanMin: r.meanTimeS == null ? null : +(r.meanTimeS / 60).toFixed(1), sdMin: r.sdTimeS == null ? null : +(r.sdTimeS / 60).toFixed(1), p60: r.p60, p120: r.p120, bestMin: r.bestTimeS == null ? null : +(r.bestTimeS / 60).toFixed(1), hell: r.hellRate, z: r.vsPrev ? r.vsPrev.z : null, verdict: r.vsPrev ? r.vsPrev.verdict : '', note: r.note || '' }))); } catch (e) { } return versionRows(); },
                // pure functions exposed for unit testing
                test: {
                    scoreCard, isTopRecord, parseMoneyToken, parseResultScreen, computeReward,
                    hellTimeBonus, versionReport, versionComparison, versionRows, freezeSnapshot, rollupStats,
                    lineCost, sampleParams, gatherThreats, gatherLoot, computeRoadmap, planMove, maybeAbilities,
                    chooseRoster, rosterUcb,
                    roadmap: () => ({ cocktails: PLAN_COCKTAILS.slice(), ingredients: PLAN_INGREDIENTS.slice() }),
                    computeRoadmap, superKey: c => SUPER_KEY_INGREDIENT[c],
                    // v6.93.0: the CEM search box, so `runaway-guard` can test
                    // the SPACE rather than only the optimiser's position in it.
                    tunable: () => JSON.parse(JSON.stringify(TUNABLE)),
                    // v6.111.0: the one-shot migration table, so store-guard can
                    // assert it is emptied once its migration has run.
                    tunablePrior: () => JSON.parse(JSON.stringify(TUNABLE_PRIOR)),
                    evolutionPending, takeCraftPrompt, stateHandlers: STATE_HANDLERS, handleScreens,
                    // v6.88.0 AUDIT: hooks for the regression suite
                    versionRows, applyParams, saveLearn, pruneVersions,
                    // v6.96.2: store-guard + phase-audit hooks
                    getLearn: () => learn, loadLearn, buildPhaseRow, appendAuditRow, refitCem, recenterSearch, demoSave: () => demoSave(),
                    // v6.111.0: the ult-economy accumulators (invulnAllTicks,
                    // ultCasts, ultCdMulSeen, laneInTicks) are per-run and are
                    // cleared in startRun. Testing them without this hook means
                    // asserting against whatever the previous scenario left
                    // behind, which is how a per-run counter quietly becomes a
                    // per-session one.
                    startRun,
                    // v6.112.0: startRun sets hellDetected = pendingHellEntry,
                    // i.e. FALSE. In a live run the play-state handler latches
                    // it from the page's `hell` flag; a scenario calling
                    // planMove directly never reaches that handler, so a
                    // post-startRun hell scene silently runs as a DAY scene.
                    latchHell: () => latchHellDuringPlay(),
                    // v6.120.0: read the latch back. The day-spine retraction
                    // tests are only meaningful if the "day" scene really is a
                    // day scene, and the ONLY way to know is to ask the latch —
                    // `global.hell` is the page flag, not the bot's state, and
                    // the two disagree for exactly one startRun.
                    hellLatched: () => hellDetected,
                    // v6.112.0: the mitigation arithmetic and the run boundary
                    // the boss census books on.
                    breakEven: () => contactBreakEven(),
                    regenRate: () => regenRate(),
                    // v6.122.0: read the death-cause accumulator back. The
                    // `line` class was booking proximity to UNARMED lanes as
                    // a death, and nothing could see it from outside.
                    dangerAccum: () => Object.assign({}, dangerAccum),   // v6.118.0: the regen spine reads this
                    reportSummary, showReport,   // v6.113.0: the overlay report is the product now
                    trimReport, REPORT_BUDGET_KB,   // v6.125.0: the prompt-size budget, pure function of the report
                    isImmortalRow, immortalCount, immortalRowsCount, bookImmortal, graduationPick, graduationStatus,   // v6.125.0/6.126.0: the immortal stop rule (a COUNT)
                    versionAtOrAfterEpoch,   // v6.128.0: the reset floor a pre-reset row must clear to still count
                    // v6.132.0: this MUST persist, not just assign. bookImmortal
                    // and graduationPick now re-read localStorage first (the
                    // multi-tab fix), so a fixture that lives only in memory is
                    // overwritten by the stored blob before the code under test
                    // ever sees it. Writing through keeps the test surface and
                    // the real load path telling the same story.
                    setGraduation: (g) => {
                        graduation = g || { graduated: {} };
                        try { localStorage.setItem(GRADUATION_KEY, JSON.stringify(graduation)); } catch (e) { }
                    },
                    graduationKey: () => GRADUATION_KEY,   // v6.126.0: the persistence test reads the store back
                    setPhaseRows: (rows) => { phaseAudit = phaseAudit || {}; phaseAudit.rows = rows; },
                    endRun: () => finishRun(),
                    startDemo: () => { demoToggle(); }, phaseRows: () => (phaseAudit.rows || []).slice(),
                    // v6.109.0: drive the RECORDER, not just the digest. The
                    // demo-digest scenario feeds pre-built samples through
                    // localStorage, so it exercises demoDigest and never
                    // demoTick — the capture path shipped untested until a
                    // teeth check on `def` came back green with the field
                    // deleted.
                    demoTick: () => demoTick(),
                    demoSamples: () => (demoRec && demoRec.samples) ? demoRec.samples.slice() : null,
                    craftPending: () => craftPending, crafts: () => craftsThisRun,
                    resetCraftLatch: () => { craftPending = null; },
                    notNameForm, clickTextIf,
                    handleLevelUp, gunPathProgress,
                    activeRoster: () => activeRoster,
                    bossRing: () => bossRingRef.v,
                    // test-only: age the hell-entry stamp so the 90s entry
                    // window (`hellRecent`) is past and the boss-ring branch
                    // is reachable without sleeping for a minute and a half.
                    ageHellEntry: ms => { if (hellEnteredAt) hellEnteredAt -= (ms || 120000); },
                    // test-only: seed the level table. Several planner branches
                    // (zoner / MOJITO sniper / anchor) key on owned levels that
                    // are otherwise only learned from level-up cards.
                    setOwned: obj => { for (const k in obj) ownedLevels[k] = obj[k]; },
                    // v6.88.1: a pick that never landed must leave BOTH of these
                    // untouched — that is the whole assertion of levelup-miss.
                    getOwned: () => Object.assign({}, ownedLevels),
                    pickAudit: () => pickAudit.slice(),
                    setParam: (k, v) => setParam(k, v),
                    setEnemyMul: obj => { learn.enemyTypeMul = obj; },
                    setEnemyN: obj => { learn.enemyTypeN = obj; },
                    // v6.107.0 drop-anchor / ring hooks
                    setKillRate: v => { killRate = v; },
                    // v6.122.0: REMOVED — this was a SECOND `tunable` key in
                    // the same object literal, and the later key wins, so the
                    // deep copy 70 lines above was silently replaced by a
                    // reference to the LIVE search box. Any consumer that
                    // mutated it rewrote the real bounds that sampleParams,
                    // refitCem, sanitizeCem and the box-reopen migration all
                    // clamp against. tunablePrior() kept its copy; these two
                    // halves of the same idiom had drifted apart.
                    setCemMean: (k, v) => { learn.cem.mean[k] = v; },
                    bossRing: () => bossRingRef.v,
                    // v6.107.0 tag-bandit hooks
                    tagsOf, enemyContextBonus,
                    setTagUcb: obj => { learn.tagucb = obj; },
                    getTagUcb: () => learn.tagucb || {},
                    tagLearnBonusOf: n => tagLearnBonus(n, pickContext()),
                    // credit a synthetic pick list, exactly as a finished run would
                    creditTagPicks: (picks, reward) => {
                        const save = runPickCtx;
                        runPickCtx = picks.map(q => ({ name: q.name, x: pickContext() }));
                        creditTagUcb(reward);
                        runPickCtx = save;
                    },
                    hitTypes: () => Object.assign({}, hitTypeRun),
                    hitTypeCounts: () => Object.assign({}, hitTypeN),
                    resetHitTypes: () => { hitTypeRun = {}; hitTypeN = {}; },
                    bossHitSamples: () => bossHitD.slice(),
                    applyDefaults: () => applyParams(DEFAULT_PARAMS),
                    sigmasAtFloor, paramDist, hofRecord,
                    charProfile: charOf,
                    setChar: b => { if (CHARS[b]) activeChar = b; },
                    // v6.99.3: the early-cap stability proof reads the run's
                    // supers count; the test arranges it directly.
                    setSupers: n => { supersThisRun = n; },
                    resetCapLatch: () => { capStableSince = null; capEarly = false; capDipSince = null; capBestStreakS = 0; capLastResetReason = null; resetBuildGate(); },
                    // v6.101.0: the ladder's own clock, so a scenario can put
                    // the run at a chosen rung without replaying 4 minutes.
                    resetCapLadder: () => { capFirstGt = null; capHurtAt = 0; capForcedThisRun = false; capReadyGt = null;
                        capEarly = false; capStableSince = null; capLastResetReason = null;
                        resetBuildGate();   // v6.132.0: a run boundary clears the build latch too
                        capFirstWall = 0; satSince = null; satPeakEn = 0; },
                    // v6.108.0 hooks. The two escapes are WALL-clock by
                    // design, so a test cannot advance them with gameTime —
                    // it has to age the stamps directly.
                    ageCapWall: ms => { if (capFirstWall) capFirstWall -= (ms || 0); },
                    ageSat: ms => { if (satSince) satSince -= (ms || 0); },
                    armCap: () => { capEarly = true; },
                    killRate: () => killRate,
                    reward: (stats, o) => { const sh = hellRunEnded, sc = capEarly;
                        hellRunEnded = !!(o && o.hell); capEarly = !!(o && o.cap);
                        const r = computeReward(stats); hellRunEnded = sh; capEarly = sc; return r; },
                    rewardEpoch: () => REWARD_EPOCH,
                    phaseRow: (t, hell) => buildPhaseRow(t, hell),
                    capState: () => ({ capEarly, lastResetReason: capLastResetReason,
                                       satSince, satPeakEn, capFirstWall }),
                    setSupers: n => { supersThisRun = n; },
                    speedSamples: () => spdSamples.slice(),
                    capDebug: () => ({ capStableSince, capEarly, capDipSince, capBestStreakS, capLastResetReason, capFirstGt, capForcedThisRun, capReadyGt }),
                    // v6.86.11: the pat/minguk rotation is testable — the pin
                    // was lifted, and a rotation that silently stops rotating
                    // is exactly the 6.85.0 bug that cost a hundred runs.
                    activeChar: () => activeChar,
                    nextRotationChar, chooseBartender,
                    resetUltGate: () => { lastUlt = 0; }, resetPoTracking,
                    reloadLearn: () => { learn = loadLearn(); },
                    liveCrownTimeS   // v6.91.6: so the test can prove the STOP threshold still tracks the board
                }
            };
            // v6.85.12: pineBot.bossHitRange() — the measured boss damage ring.
            // Percentiles of the player->boss distance at every frame a boss
            // lost HP. p95 is the practical outer edge: past it our damage was
            // not landing. Compare against the ring the planner actually holds
            // (max(e.r+55, min(reach+10,150)) in hell, max(reach+60,240) in day).
            // v6.87.3: pineBot.gunForced() — every level-up pool that offered
            // nothing but off-plan super lines: when it happened, what was on
            // the table, and which one had to be eaten.
            window.pineBot.gunForced = () => ({
                n: gunForcedLog.length,
                note: gunForcedLog.length ? 'pools where every card advanced an off-plan super line'
                                          : 'no forced pool seen yet',
                pools: gunForcedLog.slice(-20)
            });
            window.pineBot.bossHitRange = () => {
                const a = bossHitD.slice().sort((x, y) => x - y);
                if (!a.length) return { n: 0, note: 'no boss damage observed yet — run until a boss is engaged' };
                const q = f => a[Math.min(a.length - 1, Math.floor(a.length * f))];
                return { n: a.length, min: a[0], p25: q(0.25), median: q(0.5), p75: q(0.75), p95: q(0.95), max: a[a.length - 1] };
            };
            // v6.85.13: pineBot.damageAudit() — what is ACTUALLY damaging us.
            // `byClass` counts every event where that hazard was in range;
            // `sole` counts only events where it was the ONLY candidate, which
            // is the ground truth. `unattributed` counts hits with NO hazard in
            // range at all — the existing classifier books those as 'contact',
            // so a large share here means the recorded death causes are wrong
            // and the hazard model is missing a damage source outright.
            window.pineBot.damageAudit = () => {
                const pct = (x, t) => t ? Math.round(100 * x / t) : 0;
                const q = (a, f) => { if (!a.length) return null; const s2 = a.slice().sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(s2.length * f))]; };
                const bd = dmgAudit.none.bossD, nr = dmgAudit.none.near;
                const shape = tbl => {
                    const o = {};
                    for (const k of Object.keys(tbl)) o[k] = { n: tbl[k].n, hp: Math.round(tbl[k].hp), hpShare: pct(tbl[k].hp, dmgAudit.hp) + '%' };
                    return o;
                };
                return {
                    runs: dmgAudit.runs || 0, events: dmgAudit.n, hpLost: Math.round(dmgAudit.hp),
                    byClass: shape(dmgAudit.cls),
                    sole: shape(dmgAudit.sole),
                    unattributed: {
                        n: dmgAudit.none.n, hp: Math.round(dmgAudit.none.hp),
                        eventShare: pct(dmgAudit.none.n, dmgAudit.n) + '%',
                        hpShare: pct(dmgAudit.none.hp, dmgAudit.hp) + '%',
                        bossD: bd.length ? { p25: q(bd, 0.25), median: q(bd, 0.5), p75: q(bd, 0.75) } : null,
                        near: nr.length ? { p25: q(nr, 0.25), median: q(nr, 0.5), p75: q(nr, 0.75) } : null
                    },
                    note: '`sole` is ground truth. A large `unattributed` share means the classifier is booking unknown damage as contact.'
                };
            };
            window.pineBot.damageEvents = () => dmgAudit.ev.slice();
            // v6.85.22: the learned per-type threat multipliers and the raw
            // per-type damage attribution behind them.
            window.pineBot.enemyThreat = () => ({
                learnedMul: Object.assign({}, (learn && learn.enemyTypeMul) || {}),
                damageByType: Object.assign({}, dmgAudit.byType || {})
            });
            // v6.89.7: pineBot.incomeAudit() — the arithmetic of deep survival.
            // Contact damage is rate-limited near 40 dps by the 33-frame invuln,
            // and past the speed crossover positioning cannot move that much.
            // So what decides a deep run is whether heal income clears the
            // floor. Each row is a 10-minute slice of gameTime: `lossPerSec`
            // against `gainPerSec`, with `net` the number that matters. Rows
            // with little `dtS` are noise — read `dtS` before reading `net`.
            window.pineBot.incomeAudit = () => {
                const rows = Object.keys(incAudit.buckets)
                    .map(Number).sort((a, b) => a - b)
                    .map(k => {
                        const b = incAudit.buckets[k];
                        const per = x => b.dtS > 0 ? +(x / b.dtS).toFixed(2) : null;
                        return {
                            fromMin: Math.round(k / 60), dtS: Math.round(b.dtS),
                            lossPerSec: per(b.lossHp), gainPerSec: per(b.gainHp),
                            net: b.dtS > 0 ? +((b.gainHp - b.lossHp) / b.dtS).toFixed(2) : null,
                            events: { loss: b.lossN, gain: b.gainN },
                            spikes: b.spikeN ? { n: b.spikeN, hp: Math.round(b.spikeHp) } : null
                        };
                    });
                const deep = rows.filter(r => r.fromMin >= 20 && r.dtS >= 60);
                return {
                    runs: incAudit.runs || 0, buckets: rows,
                    firstNegativeMin: (deep.find(r => r.net != null && r.net < 0) || {}).fromMin ?? null,
                    note: 'net < 0 means the pool is draining at that depth: no posture fixes that, only heal income or time-stop uptime. Ignore rows with dtS under ~60. `spikes` are level-up maxHp raises and revives, excluded from gainPerSec.'
                };
            };
            // v6.91.1: pineBot.huntAudit() — does the dormant/frozen-boss hunt
            // actually damage anything? The one boss measured live had 6.03e9
            // hp. If `dmg` stays at 0 across a few dozen attempts the hunt is a
            // walk to the edge that accomplishes nothing.
            window.pineBot.huntAudit = () => {
                const a = huntAudit || {};
                const n = a.attempts || 0;
                return {
                    runs: a.runs || 0, attempts: n, frozenAttempts: a.frozenAttempts || 0,
                    secsTotal: Math.round(a.secs || 0),
                    secsPerAttempt: n ? +((a.secs || 0) / n).toFixed(1) : null,
                    dmgTotal: Math.round(a.dmg || 0),
                    dmgPerAttempt: n ? Math.round((a.dmg || 0) / n) : null,
                    best: Math.round(a.best || 0),
                    vanished: a.vanished || 0,
                    note: 'dmg is the target boss hp lost while the bot held the post. `vanished` = the id left the enemy list (a kill OR a despawn — indistinguishable here). dmgTotal 0 over 20+ attempts means the hunt should become a warning posture, not a trip.'
                };
            };
            window.pineBot.resetHuntAudit = () => {
                huntAudit = { attempts: 0, frozenAttempts: 0, dmg: 0, best: 0, vanished: 0, secs: 0, runs: 0 };
                huntMark = null;
                try { localStorage.removeItem(HUNT_AUDIT_KEY); } catch (e) { }
                return 'hunt audit cleared';
            };
            // v6.91.3: pineBot.markAudit() — does the corner actually clear the
            // marks? `worstMargin` is the closest a mark edge ever came to the
            // seat; negative means it covered it. `rMax` climbing with depth
            // would mean the 80.92px geometry lapses and the corner is the wrong
            // answer to marks at depth.
            window.pineBot.markAudit = () => {
                const rows = Object.keys(markAudit.buckets || {}).map(Number).sort((a, b) => a - b).map(k => {
                    const b = markAudit.buckets[k];
                    return {
                        fromMin: Math.round(k / 60), n: b.n,
                        rAvg: b.n ? +(b.rSum / b.n).toFixed(1) : null,
                        rMin: b.rMin == null ? null : +b.rMin.toFixed(1),
                        rMax: b.rMax == null ? null : +b.rMax.toFixed(1),
                        worstMargin: b.worstMargin == null ? null : +b.worstMargin.toFixed(1),
                        coveredSeat: b.covers
                    };
                });
                return {
                    runs: markAudit.runs || 0, buckets: rows,
                    seatGeometry: 'true corner (0,0) is 80.92px from the nearest spawnable mark centre (52,62); the seat used before 6.91.3 was (p.r,p.r) = 70.78px, and its 12px fallback was 64.03 — inside a 70px mark.',
                    note: 'worstMargin <= 0 in any bucket means the corner is NOT mark-immune at that depth. rMax rising across buckets means mark radius scales with time, which would retire the corner as the answer to marks.'
                };
            };
            // v6.91.4: pineBot.pauseAudit() — is the field ever actually stopped?
            // The WHISKY SOUR tilt assumes TIME STOP is scarce. If `share` comes
            // back high, that assumption is wrong and the tilt should go.
            window.pineBot.pauseAudit = () => {
                const a = pauseAudit || {};
                const h = a.hellTicks || 0;
                return {
                    runs: a.runs || 0, hellTicks: h, pauseTicks: a.pauseTicks || 0,
                    share: h ? +((a.pauseTicks || 0) / h).toFixed(3) : null,
                    thisRun: (() => { const s = pauseShareRun(); return s == null ? null : +s.toFixed(3); })(),
                    note: 'share = fraction of hell planner ticks with the field stopped (WHISKY SOUR per-enemy freeze OR a TIME STOP pickup). A high share means freezes are plentiful and the WHISKY SOUR keyless slot is redundant; a low one is the premise it was added on.'
                };
            };
            window.pineBot.resetPauseAudit = () => {
                pauseAudit = { runs: 0, hellTicks: 0, pauseTicks: 0 };
                runHellTicks = 0; runPauseTicks = 0;
                try { localStorage.removeItem(PAUSE_AUDIT_KEY); } catch (e) { }
                return 'pause audit cleared';
            };
            // v6.91.8: pineBot.parkAudit() — the 10% vs the 90%.
            // 6.91.6 showed a BIMODAL distribution: nothing between 26 and 124
            // minutes. A run either reaches the seat or dies at the entrance, so
            // the only lever left is P(reach the seat). This compares the build
            // AT THE ENTRANCE for runs that got seated against runs that did not.
            window.pineBot.parkAudit = () => {
                const rs = (parkAudit && parkAudit.runs) || [];
                const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y);
                    return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
                const grp = (list, label) => ({
                    group: label, n: list.length,
                    medianTimeS: med(list.map(r => r.t)),
                    medianEntryDef: med(list.filter(r => r.entry).map(r => r.entry.def)),
                    medianEntryRegen: med(list.filter(r => r.entry).map(r => r.entry.regen)),
                    medianEntrySupers: med(list.filter(r => r.entry).map(r => r.entry.supers)),
                    zonerShare: list.length ? +(list.filter(r => r.entry && r.entry.zoner).length / list.length).toFixed(2) : null
                });
                const seated = rs.filter(r => r.first != null);
                const never = rs.filter(r => r.first == null);
                return {
                    hellRuns: rs.length,
                    reachedSeat: seated.length,
                    reachRate: rs.length ? +(seated.length / rs.length).toFixed(2) : null,
                    medianFirstParkS: med(seated.map(r => r.first)),
                    medianSeatShare: med(seated.map(r => Math.round((r.seatShare || 0) * 100))),
                    groups: [grp(seated, 'REACHED THE SEAT'), grp(never, 'NEVER PARKED')],
                    note: 'parkArmor needs defense >= deepHell.parkDefense (30, about 5.15 OLIVE-equivalents) and regen >= parkRegenRate (1.0), plus SOUTH SIDE. If medianEntryDef is far below 30 in the NEVER group and at/above it in the SEATED group, the entrance build IS the lever and the fix is upstream in the picker, not in the posture.'
                };
            };
            // v6.112.0 pineBot.bossCensus() — the spawn timetable and the size
            // curve, measured. USER: "given the predictability of the bosses
            // appearance and the size at which they appear, the bot can be
            // calibrated better."
            //
            // Grouped by boss KIND (bossChar/type), because that is what a
            // timetable is indexed by. For each kind: how many runs saw it, the
            // median gt it first appeared, the median radius at first sighting,
            // and the median radius growth per 100 game-seconds fitted from the
            // per-boss samples. `ringAt` is the extrapolated gt at which that
            // kind crosses deepHell.ringShare of the canvas — i.e. when the
            // deep-hell regime becomes available, predicted rather than waited
            // for. A tight `ringAt` across runs IS the calibration the user is
            // describing, and a wide one says the timetable is not the whole
            // story and something else gates the size.
            window.pineBot.bossCensus = () => {
                const runs = (bossCensus && bossCensus.runs) || [];
                const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y);
                    return s.length % 2 ? s[(s.length - 1) / 2] : +(((s[s.length / 2 - 1] + s[s.length / 2]) / 2).toFixed(2)); };
                const W = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
                const target = W * (CONFIG.deepHell.ringShare != null ? CONFIG.deepHell.ringShare : 0.55) / 2;
                const kinds = {};
                for (const run of runs) {
                    for (const b of (run.b || [])) {
                        const k = kinds[b.k] || (kinds[b.k] = { kind: b.k, n: 0, wall: !!b.wall,
                            gts: [], r0s: [], hp0s: [], slopes: [], ringAts: [], spans: [] });
                        k.n++; k.gts.push(b.gt); k.r0s.push(b.r0);
                        if (b.hp0) k.hp0s.push(b.hp0);
                        // v6.116.0: how much game time the KEPT samples actually
                        // cover. Two versions of this census reported nothing
                        // because the sampling window was wrong in opposite
                        // directions, and neither report said so — the span is
                        // the number that would have caught both immediately.
                        if ((b.rs || []).length >= 2) k.spans.push(b.rs[b.rs.length - 1][0] - b.rs[0][0]);
                        // least-squares slope of r against gt over this boss's samples
                        const s = b.rs || [];
                        if (s.length >= 3) {
                            let sx = 0, sy = 0, sxx = 0, sxy = 0;
                            for (const [x, y] of s) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
                            const d = s.length * sxx - sx * sx;
                            if (Math.abs(d) > 1e-6) {
                                const m = (s.length * sxy - sx * sy) / d;          // px per game-second
                                k.slopes.push(+(m * 100).toFixed(2));               // per 100 s
                                if (m > 1e-6) k.ringAts.push(Math.round(b.gt + (target - b.r0) / m));
                            }
                        }
                    }
                }
                return {
                    note: 'runs = census rows kept. Per KIND: firstGt = median gt first sighted, r0 = median radius then, growth = median px per 100 game-seconds (least squares over that boss\'s own samples), ringAt = extrapolated gt it crosses ringShare of the canvas (radius ' + Math.round(target) + 'px) — i.e. when the deep-hell regime opens. A TIGHT ringAt spread across runs is the calibration; a wide one means size is not on a clean timetable. Read `n` first: n<20 is noise. Walls (NO BOOKING) are flagged and excluded from ringHuge.',
                    runs: runs.length,
                    ringTargetR: Math.round(target),
                    kinds: Object.values(kinds).sort((a, b2) => (med(a.gts) || 0) - (med(b2.gts) || 0)).map(k => ({
                        kind: k.kind, n: k.n, wall: k.wall,
                        firstGt: med(k.gts), r0: med(k.r0s), hp0: med(k.hp0s),
                        // spanS = median game-seconds the kept samples cover.
                        // A null growth with a SHORT span means the cadence is
                        // too slow for how long these bosses live; a flat
                        // growth with a short span means the fit was taken
                        // before the growth. Both have shipped.
                        spanS: med(k.spans),
                        growthPer100s: med(k.slopes),
                        ringAt: med(k.ringAts),
                        ringAtSpread: k.ringAts.length >= 3
                            ? [Math.min.apply(null, k.ringAts), Math.max.apply(null, k.ringAts)] : null
                    }))
                };
            };
            // v6.118.0 — the craft-prompt census. `ready` = ticks a craft was
            // OWED (both halves maxed); `seen` = ticks a craft-ish button was
            // on screen; `clicked` / `confirmed` = what we did and whether the
            // prompt then went away. ready >> seen means the prompt never
            // appears (the game's trigger, not ours); seen >> clicked means the
            // selectors miss it and `labels` says what it actually reads;
            // clicked >> confirmed means the click does not land.
            window.pineBot.craftAudit = () => {
                const a = craftAudit || {};
                return {
                    note: 'ready = planner ticks with both halves of a CRAFT_PAIR at max, i.e. a craft is owed. seen = ticks a craft-ish button was visible. clicked = prompts we clicked. confirmed = prompts that then disappeared (proof the click worked). READ ready vs seen FIRST: a large ready with seen 0 means the prompt never appears and the bug is upstream of this script; seen without clicked means the selectors missed it, and `labels` holds the real button text.',
                    runs: a.runs || 0, ready: a.ready || 0, seen: a.seen || 0,
                    clicked: a.clicked || 0, confirmed: a.confirmed || 0,
                    labels: a.labels || {}, pairs: a.pairs || {}
                };
            };
            window.pineBot.resetCraftAudit = () => {
                craftAudit = { runs: 0, ready: 0, seen: 0, clicked: 0, confirmed: 0, labels: {}, pairs: {} };
                craftAuditSave(); return 'craft audit cleared';
            };
            window.pineBot.resetBossCensus = () => {
                bossCensus = { runs: [] };
                try { localStorage.removeItem(BOSS_CENSUS_KEY); } catch (e) { }
                return 'boss census cleared';
            };
            window.pineBot.resetParkAudit = () => {
                parkAudit = { runs: [] };
                try { localStorage.removeItem(PARK_AUDIT_KEY); } catch (e) { }
                return 'park audit cleared';
            };
            // v6.96.2: pineBot.phaseAudit() — the funnel, per version+char.
            // Every run books exactly one phase (day / entry / hell / deep),
            // so the four death counts ARE the survival story: dayClearRate
            // is the day lever, entrySurvival is the seat's lever, and
            // deepRate (cap-outs included, reported separately) is the
            // doctrine's bottom line. parkAudit stays the seat's detail view;
            // this is the view that sees the 82% who never got there.
            window.pineBot.phaseAudit = () => {
                const rows = (phaseAudit && phaseAudit.rows) || [];
                const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y);
                    return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
                const by = {};
                for (const r of rows) {
                    const g = by[r.v] || (by[r.v] = { version: r.v, n: 0, deaths: { day: 0, entry: 0, hell: 0, deep: 0 },
                        dayCleared: 0, hellEntered: 0, seated: 0, caps: 0, defs: [], regens: [], ults: [], times: [] });
                    g.n++; g.deaths[r.ph] = (g.deaths[r.ph] || 0) + 1;
                    if (r.day) g.dayCleared++;
                    if (r.ph !== 'day') { g.hellEntered++; if (r.seat) g.seated++; }
                    if (r.cap) g.caps++;
                    // v6.99.4: split early (stability proof) from clock caps,
                    // and keep the latch times so fromS can be tuned from data.
                    if (r.capAt != null) {
                        g.capAts = g.capAts || [];
                        g.capAts.push(r.capAt);
                        if (r.capAt < ((CONFIG.deepHell && CONFIG.deepHell.runCapS) || 9000)) g.earlyCaps = (g.earlyCaps || 0) + 1;
                    }
                    // v6.102.0: when the BUILD was complete, cap-out or not —
                    // the datum capStable.fromS should be set from.
                    if (r.readyAt != null) { g.readyAts = g.readyAts || []; g.readyAts.push(r.readyAt); }
                    // v6.112.0 THE REGIME. `deepRate` below counts runs that
                    // ENDED past deepFromS — a clock that is blind to whether
                    // the anchor ever worked, and that the early cap makes
                    // structurally unreachable for exactly the runs we want
                    // (a proven build is killed at capStable.fromS 2400, and
                    // deepFromS is 7200). These count the state instead.
                    if (r.deepAt != null) { g.deepAts = g.deepAts || []; g.deepAts.push(r.deepAt); }
                    if (r.deepHold != null) {
                        g.deepHolds = g.deepHolds || [];
                        g.deepHolds.push(r.deepHold);
                        if (r.deepHold >= ((CONFIG.phaseAudit && CONFIG.phaseAudit.deepHoldS) || 120))
                            g.deepHeld = (g.deepHeld || 0) + 1;
                    }
                    if (r.deepStill != null) { g.deepStills = g.deepStills || []; g.deepStills.push(r.deepStill); }
                    if (r.deepInv != null) { g.deepInvs = g.deepInvs || []; g.deepInvs.push(r.deepInv); }
                    if (Array.isArray(r.deepHolds)) { g.allHolds = (g.allHolds || []).concat(r.deepHolds); }
                    if (r.deepBreak) { g.breaks = g.breaks || {};
                        for (const k of Object.keys(r.deepBreak)) g.breaks[k] = (g.breaks[k] || 0) + r.deepBreak[k]; }
                    // v6.116.0: the seat-miss census, summed across runs, plus
                    // the two totals it is a share of.
                    if (r.parkMiss) { g.miss = g.miss || {};
                        for (const k of Object.keys(r.parkMiss)) g.miss[k] = (g.miss[k] || 0) + r.parkMiss[k]; }
                    if (r.hellT != null) g.hellT = (g.hellT || 0) + r.hellT;
                    if (r.parkT != null) g.parkT = (g.parkT || 0) + r.parkT;
                    // v6.113.0: the v6.111.0 instruments were written to every
                    // phase ROW and never aggregated, so the funnel — the thing
                    // actually read — could not show whether the lane override
                    // or the ult economy had moved at all.
                    if (r.laneIn != null) g.laneIn = (g.laneIn || 0) + r.laneIn;
                    if (r.laneEsc != null) g.laneEsc = (g.laneEsc || 0) + r.laneEsc;
                    if (r.laneDiv != null) g.laneDiv = (g.laneDiv || 0) + r.laneDiv;
                    if (r.invAll != null) { g.invAlls = g.invAlls || []; g.invAlls.push(r.invAll); }
                    if (r.inv != null) { g.invs = g.invs || []; g.invs.push(r.inv); }
                    if (r.casts != null) { g.castsArr = g.castsArr || []; g.castsArr.push(r.casts); }
                    if (r.cdMul != null) { g.cdMuls = g.cdMuls || []; g.cdMuls.push(r.cdMul); }
                    if (r.ultMax != null) { g.ultMaxes = g.ultMaxes || []; g.ultMaxes.push(r.ultMax); }
                    // v6.108.0 the stall signature, aggregated per version.
                    if (r.spd != null) { g.spds = g.spds || []; g.spds.push(r.spd); }
                    if (r.spdLo != null) { g.spdLos = g.spdLos || []; g.spdLos.push(r.spdLo); }
                    if (r.enMax != null) { g.enMaxes = g.enMaxes || []; g.enMaxes.push(r.enMax); }
                    if (r.why === 'saturated') g.satCaps = (g.satCaps || 0) + 1;
                    if (r.def != null) g.defs.push(r.def);
                    if (r.regen != null) g.regens.push(r.regen);
                    if (r.ultLv != null) g.ults.push(r.ultLv);
                    g.times.push(r.t);
                }
                return {
                    rows: rows.length,
                    note: 'phase = where the run ENDED. entrySurvival = of hell entrants, the share that outlived the first ' +
                          ((CONFIG.phaseAudit && CONFIG.phaseAudit.entryS) || 300) + ' s. deep includes cap-outs (capOuts counts them; those rows are right-censored, not natural deaths). ' +
                          'READ deepHeldRate, NOT deepRate. deepRate counts runs that ENDED past deepFromS (' +
                          ((CONFIG.phaseAudit && CONFIG.phaseAudit.deepFromS) || 7200) + ' s) — a clock blind to whether the anchor ever worked, and one the early cap makes unreachable for the runs that matter: a proven build is killed at capStable.fromS (' +
                          ((CONFIG.deepHell && CONFIG.deepHell.capStable && CONFIG.deepHell.capStable.fromS) || 2400) + ' s), so a WORKING build can never be booked deep while a failing one can. ' +
                          'deepHeldRate = share of runs that held the REGIME (boss ring >= 55% of canvas, tips stopped past ' +
                          ((CONFIG.deepHell && CONFIG.deepHell.tipWindowToS) || 4800) + ' s, corner-anchored with zero velocity) for ' +
                          ((CONFIG.phaseAudit && CONFIG.phaseAudit.deepHoldS) || 120) + ' s. deepStill/deepInv are percentages DURING the hold: how much of it needed no movement, and how much was covered by an ult window.',
                    groups: Object.values(by).map(g => ({
                        version: g.version, n: g.n, deaths: g.deaths,
                        dayClearRate: +(g.dayCleared / g.n).toFixed(2),
                        entrySurvival: g.hellEntered ? +((g.hellEntered - (g.deaths.entry || 0)) / g.hellEntered).toFixed(2) : null,
                        deepRate: +((g.deaths.deep || 0) / g.n).toFixed(2),
                        capOuts: g.caps,
                        earlyCaps: g.earlyCaps || 0,
                        medianCapAt: med(g.capAts || []),
                        buildsReady: (g.readyAts || []).length,
                        medianReadyAt: med(g.readyAts || []),
                        // v6.112.0 — the two numbers that answer "is the bot
                        // stable enough". deepReached counts runs that ENTERED
                        // the regime at all; deepHeldRate counts those that
                        // held it for deepHoldS. Read deepHeldRate as the
                        // scoreboard and deepStill/deepInv as the proof that
                        // what was held is the posture the user described
                        // rather than something that merely coincided with it.
                        deepReached: (g.deepAts || []).length,
                        medianDeepAt: med(g.deepAts || []),
                        deepHeldRate: +((g.deepHeld || 0) / g.n).toFixed(3),
                        medianDeepHold: med(g.deepHolds || []),
                        medianDeepStill: med((g.deepStills || []).map(v => Math.round(v * 100))),
                        medianDeepInv: med((g.deepInvs || []).map(v => Math.round(v * 100))),
                        // v6.115.0 — set deepHoldS from medianHold, and read
                        // deepBreak to see WHICH clause keeps dropping.
                        holds: (g.allHolds || []).length,
                        medianHold: med(g.allHolds || []),
                        maxHold: (g.allHolds || []).length ? Math.max.apply(null, g.allHolds) : null,
                        deepBreak: g.breaks || null,
                        // v6.116.0 THE SEAT CENSUS. seatShare is the fraction
                        // of all hell ticks the bot was actually anchored;
                        // parkMiss is every other tick sorted by what took it,
                        // in planner precedence (build gates armor/regen/clear,
                        // then early, then the exceptions mark/line/yield, then
                        // the overrides cap/lane/hunt, then walk = parkOn was
                        // true and the bot was still crossing to the corner).
                        // The largest bucket is the next version's target.
                        seatShare: g.hellT ? +((g.parkT || 0) / g.hellT).toFixed(3) : null,
                        parkMiss: g.miss || null,
                        // v6.113.0 lane override + ult economy, aggregated
                        laneIn: g.laneIn || 0, laneEsc: g.laneEsc || 0, laneDiv: g.laneDiv || 0,
                        medianInv: med((g.invs || []).map(v => Math.round(v * 100))),
                        medianInvAll: med((g.invAlls || []).map(v => Math.round(v * 100))),
                        medianCasts: med(g.castsArr || []),
                        medianCdMul: med(g.cdMuls || []),
                        ultMaxedRate: (g.ultMaxes || []).length
                            ? +(g.ultMaxes.filter(v => v >= 6).length / g.ultMaxes.length).toFixed(2) : null,
                        seatedRate: g.hellEntered ? +(g.seated / g.hellEntered).toFixed(2) : null,
                        medianEntryDef: med(g.defs), medianEntryRegen: med(g.regens), medianEntryUlt: med(g.ults),
                        medianTimeS: med(g.times),
                        // v6.108.0: 1.0 is a healthy page. The stall that
                        // motivated this version ran at 0.021 with enemies
                        // pinned at the ~260 entity cap. satCaps counts the
                        // runs the new saturation arm ended.
                        medianSpeed: med(g.spds || []),
                        worstSpeed: (g.spdLos || []).length ? Math.min.apply(null, g.spdLos) : null,
                        medianPeakEnemies: med(g.enMaxes || []),
                        satCaps: g.satCaps || 0
                    }))
                };
            };
            window.pineBot.resetPhaseAudit = () => {
                phaseAudit = { rows: [] };
                try { localStorage.removeItem(PHASE_AUDIT_KEY); } catch (e) { }
                return 'phase audit cleared';
            };
            // v6.100.1 (user: "the bot is not dying even with the kill
            // protocol"): a LIVE inspector for the early-cap stability proof,
            // so a run that "should" be immortal but keeps dashing can be
            // checked mid-run instead of guessed at. Call this while a hell
            // run is past capStable.fromS and read WHY capEarly hasn't
            // latched: streakS vs holdS needed, which leg (hp/def/supers) is
            // short, and bestStreakS (the closest this run has gotten).
            window.pineBot.capStatus = () => {
                const CS = (CONFIG.deepHell && CONFIG.deepHell.capStable) || {};
                const gt = safe(() => gameTime, 0) || 0;
                const p = safe(() => player, null);
                const hp = p && typeof p.hp === 'number' && typeof p.maxHp === 'number' && p.maxHp > 0
                    ? p.hp / p.maxHp : null;
                const hpFloor = CS.hpFloor != null ? CS.hpFloor : 0.97;
                const defMin = CS.defMin != null ? CS.defMin : 35;
                const supersMin = CS.supersMin != null ? CS.supersMin : 0;
                const def = liveDefense();
                // v6.132.0: the build leg reports ITSELF. Every clause carries
                // the key that answered and where the number came from, so a
                // wrong weapon-key spelling shows as `key: null, src: 'none'`
                // in the very first report instead of the gate silently never
                // firing — which is exactly how the ownedLevels['OLIVE'] trap
                // went unnoticed for four versions.
                const bg = buildGateState(true);   // force: a report must never show a cached picture
                return {
                    gt: Math.round(gt),
                    fromS: CS.fromS != null ? CS.fromS : 3600,
                    holdS: CS.holdS != null ? CS.holdS : 300,
                    dipGraceS: CS.dipGraceS != null ? CS.dipGraceS : 0,
                    capEarly, capFiredThisRun,
                    runCapS: (CONFIG.deepHell && CONFIG.deepHell.runCapS) || 0,
                    // v6.101.0 the ladder: which rung, and how long it has been climbing
                    capAt: capFirstGt == null ? null : Math.round(capFirstGt),
                    cappedForS: capFirstGt == null ? 0 : Math.round(gt - capFirstGt),
                    stage: capFirstGt == null ? 0
                        : (gt - capFirstGt) >= (CONFIG.deepHell.capForceS != null ? CONFIG.deepHell.capForceS : 240) ? 3
                        : (gt - capFirstGt) >= (CONFIG.deepHell.capStandS != null ? CONFIG.deepHell.capStandS : 150) ? 2 : 1,
                    forced: capForcedThisRun,
                    streakS: capStableSince == null ? 0 : Math.round(gt - capStableSince),
                    bestStreakS: Math.round(capBestStreakS),
                    inDip: capDipSince != null,
                    dipForS: capDipSince == null ? 0 : Math.round(gt - capDipSince),
                    lastResetReason: capLastResetReason,
                    // v6.102.0: when this run's build met armour+supers, and a
                    // standing check that defMin is actually reachable at all
                    // (it shipped at 35 against a 34.992 ceiling until 6.102.0).
                    readyAt: capReadyGt == null ? null : Math.round(capReadyGt),
                    defMinReachable: defMin <= 34.992,
                    live: { hp: hp == null ? null : +hp.toFixed(3), def: def == null ? null : +def.toFixed(1), supers: supersThisRun },
                    need: { hpFloor, defMin, supersMin, build: (CS.build || []).map(c => (Array.isArray(c) ? c : [c]).join(' or ')) },
                    // v6.132.0: `build.legs` is the self-report. `raw` is the
                    // whole weapons map as the game holds it, capped, so a key
                    // this gate does not know is still visible in the paste.
                    build: {
                        ok: bg.ok, clauses: bg.clauses, legs: bg.legs,
                        raw: safe(() => {
                            const w = player.weapons; if (!w || typeof w !== 'object' || Array.isArray(w)) return w || null;
                            const o = {}; let n = 0;
                            for (const k in w) { if (n++ >= 40) break; o[k] = w[k]; }
                            return o;
                        }, null)
                    },
                    short: {
                        hp: hp != null && hp < hpFloor,
                        def: def != null && def < defMin,
                        build: !bg.ok,
                        buildShort: bg.legs.filter(l => !l.ok).map(l => l.need + ' ' + l.lv + '/' + l.max + ' (' + l.src + ')'),
                        supers: (typeof supersThisRun === 'number' ? supersThisRun : 0) < supersMin
                    }
                };
            };
            // v6.97.1 (user: "let's build this combined probe now"):
            // pineBot.report() — the whole statistics picture in ONE paste.
            // The four probes every tuning conversation has been asking for
            // separately: the version table, the phase funnel, the raw
            // per-run phase rows, and the damage attribution. Console use:
            //   copy(JSON.stringify(pineBot.report()))
            // v6.107.0 — THE LEARNING PROBE. Four new machines shipped in this
            // version (the tag bandit, the re-applied enemy-type multiplier,
            // the drop anchor, and two searchable ring multipliers) and none
            // of them is legible from the four probes above. `learning` is
            // where they report.
            //
            // Built to be FALSIFIABLE, on the user's standing note that this
            // game is AI-built, "has several bugs and misclassifications", and
            // "the truth is what's being observed in the game itself". Every
            // block below is evidence ABOUT a hypothesis the code encodes:
            //   tags   — WEAPON_TAGS is a guess derived from the recipe book.
            //            A tag whose weight never separates from zero is a tag
            //            that does not describe anything real. `n` is the
            //            credited weight, so read weight WITH n, never alone.
            //   enemy  — what has actually been hurting this bartender, by the
            //            game's OWN type labels. If those labels are wrong the
            //            table still holds, because it measures whatever the
            //            game calls that thing, not what it ought to be.
            //   params — where the CEM has walked the four new dimensions.
            //            A mean pinned at a box edge means the box is wrong.
            //   anchor — did the drop anchor arm at all this run. Firing rate
            //            comes before any question about whether it pays.
            window.pineBot.learning = () => {
                const round = (v, d) => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(d == null ? 2 : d) : null;
                const tags = {};
                try {
                    const tu = learn.tagucb || {};
                    for (const k of Object.keys(tu)) {
                        const m = tu[k];
                        if (!m || !Array.isArray(m.b)) continue;
                        // feature 0 is the bias: the tag's context-free value.
                        const A0 = (isFinite(m.A[0]) ? m.A[0] : 0) + 1;
                        tags[k] = { n: round(m.n, 1), weight: round((isFinite(m.b[0]) ? m.b[0] : 0) / A0, 3),
                                    boss: round(((isFinite(m.b[7]) ? m.b[7] : 0) / ((isFinite(m.A[7]) ? m.A[7] : 0) + 1)), 3),
                                    hell: round(((isFinite(m.b[4]) ? m.b[4] : 0) / ((isFinite(m.A[4]) ? m.A[4] : 0) + 1)), 3) };
                    }
                } catch (e) { }
                const enemy = {};
                try {
                    const mm = learn.enemyTypeMul || {}, nn = learn.enemyTypeN || {};
                    const minN = CONFIG.learning.enemyMulMinN;
                    for (const k of new Set([].concat(Object.keys(mm), Object.keys(nn)))) {
                        enemy[k] = { mul: round(mm[k], 3), soleHits: nn[k] || 0,
                                     applied: (nn[k] || 0) >= minN ? round(typeMul(k), 3) : 1 };
                    }
                } catch (e) { }
                // v6.109.0: ALL of them, not the four newest. This block used
                // to hardcode the 6.107.0 dimensions, which meant 23 of 27
                // were invisible — including threat.markWeight and
                // threat.lineWeight, the two that govern the 54% of day
                // deaths caused by marks and lines. `atEdge` flags a mean
                // sitting within 2% of a bound: that is the search telling
                // you the BOX is wrong, and it cannot be read any other way.
                const params = {};
                try {
                    for (const k of Object.keys(TUNABLE)) {
                        const box = TUNABLE[k], rng = box.max - box.min;
                        const mean = learn.cem.mean[k], sig = learn.cem.sigma[k];
                        const row = { live: round(getParam(k), 3), mean: round(mean, 3),
                                      sigma: round(sig, 3), box: [box.min, box.max] };
                        if (isFinite(mean) && rng > 0) {
                            if (mean <= box.min + rng * 0.02) row.atEdge = 'min';
                            else if (mean >= box.max - rng * 0.02) row.atEdge = 'max';
                        }
                        // sigma at the floor = converged, no exploration left
                        if (isFinite(sig) && rng > 0 && sig <= rng * CONFIG.learning.sigmaFloor * 1.02) row.converged = true;
                        params[k] = row;
                    }
                } catch (e) { }
                return {
                    note: 'tags: read `weight` WITH `n` — a big weight at n<20 is noise. `boss`/`hell` are the same estimate on the boss-share and hell features. enemy: `mul` is stored, `applied` is what the danger field actually used (band ' + CONFIG.learning.enemyMulFloor + '-' + CONFIG.learning.enemyMulCeil + ', needs ' + CONFIG.learning.enemyMulMinN + ' sole hits). params: ALL CEM dims. `atEdge` = the mean is against a bound, so the BOX is wrong, not the value. `converged` = sigma at the floor, no exploration left — and note that until v6.111.0 widening a box did NOT clear that state, so a dim could sit atEdge+converged across version bumps forever. `reopen` names the dims this build re-opened. ult: compare `invAll` (NOT `inv`) against a demo\'s invulnShare — `inv` is ult windows only, the demo ORs in player.invuln hit frames, and reading one against the other produced a 3.9x gap that does not exist.',
                    gen: safe(() => learn.cem.gen, null),
                    runs: safe(() => learn.runs, null),
                    // v6.111.0: which dimensions the box-change migration
                    // re-opened, and when. Silent until a box actually moves.
                    reopen: safe(() => learn.cem.lastReopen, null),
                    reopens: safe(() => learn.cem.reopens, 0),
                    tags, enemy, params,
                    anchor: { armedTicksThisRun: dropAnchorTicks, lastArmedGt: Math.round(dropAnchorLastGt) }
                };
            };
            // ── v6.113.0 ONE BUTTON, EVERY AUDIT ───────────────────────────
            //
            // USER: "I want this all done by the report on the UI overlay ...
            // when asking for audit, pine bot report, damage report, deep held
            // rate, etc."
            //
            // report() carried six of the fourteen instruments. Every session
            // has therefore ended with me asking for one of the other eight by
            // name and the user opening a console to fetch it — park, income,
            // hunt, mark, pause, picks, capStatus, bossHitRange. There is no
            // reason for that: they are all cheap pure reads of state that is
            // already in memory. Anything I can ask for is now in the object
            // the 📋 button copies.
            //
            // `safe(...)` around each: one audit throwing (an empty store, a
            // stat the page has stopped exposing) must degrade that key to
            // null, never take the whole report down with it — the failure
            // mode that would send the user straight back to the console.
            // v6.122.0: the embedded summary was built from a FIVE-KEY
            // subset, while reportSummary also reads `r.income.buckets` and
            // `r.craft`. The pasted JSON therefore lost the two lines the code
            // flags hardest — bucket-0 HP net ("the single most diagnostic
            // number in the report", and "it was buried") and the CRAFT
            // census, the one that says which half of the BLACK VERMOUTH
            // chain is broken. showReport passes the whole object, so the
            // ON-SCREEN block was complete and the COPIED text was not, which
            // is the worse way round: the 📋 button is the product.
            // Build the body once, then summarise THAT.
            // v6.125.0: report() is what gets pasted, so report() is what
            // must fit — see trimReport above showReport. reportFull() is the
            // escape hatch for a session that wants the untrimmed object.
            const reportRaw = () => { const r = reportBody(); r.summary = safe(() => reportSummary(r), null); return r; };
            window.pineBot.report = (opts) => {
                const r = reportRaw();
                const b = (opts && +opts.budgetKB) || REPORT_BUDGET_KB;
                return safe(() => trimReport(r, b), r);
            };
            window.pineBot.reportFull = reportRaw;
            window.pineBot.graduation = () => graduationStatus();
            // Undo a graduation by hand (a mis-booked streak, or the user wants
            // the character back on the bench): pineBot.ungraduate('joe').
            window.pineBot.ungraduate = (c) => { if (graduation.graduated) delete graduation.graduated[c];
                if (graduation.counts) delete graduation.counts[c];   // v6.126.0: back to work means a fresh five
                try { localStorage.setItem(GRADUATION_KEY, JSON.stringify(graduation)); } catch (e) { } return graduationStatus(); };
            const reportBody = () => ({
                note: 'paste this whole object to Claude — it contains every audit. It is trimmed to a prompt-sized budget: read `trimmed` for what was removed (only nulls; every 0 and false here is a MEASURED zero), `sizes` for each section\u2019s KB, and call pineBot.reportFull() for the untrimmed object. compare = version table; funnel = phase aggregation (READ deepHeldRate, not deepRate); phases = raw per-run rows; damage = HP-loss attribution; boss = spawn timetable + size growth + predicted ringAt; learning = CEM dims/tags/enemy types (atEdge = the BOX is wrong, converged = no exploration left); park/income/hunt/mark/pause/picks = the per-subsystem audits; cap = live kill-protocol state.',
                summary: null,
                namespace: STORE_NS ? STORE_NS.slice(1) : null,   // v6.124.0: which store this report reads
                compare: safe(() => versionComparison(), null),
                funnel: safe(() => window.pineBot.phaseAudit(), null),
                phases: safe(() => (phaseAudit.rows || []).slice(), null),
                damage: safe(() => window.pineBot.damageAudit(), null),
                boss: safe(() => window.pineBot.bossCensus(), null),
                learning: safe(() => window.pineBot.learning(), null),
                // v6.113.0 — the eight that used to require a console
                park: safe(() => window.pineBot.parkAudit(), null),
                income: safe(() => window.pineBot.incomeAudit(), null),
                hunt: safe(() => window.pineBot.huntAudit(), null),
                mark: safe(() => window.pineBot.markAudit(), null),
                pause: safe(() => window.pineBot.pauseAudit(), null),
                craft: safe(() => window.pineBot.craftAudit(), null),   // v6.118.0
                // the module array, not window.pineBot.pickAudit — that lives
                // under pineBot.test and the optional-call guard would have
                // silently produced `undefined`, which JSON.stringify DROPS.
                // A key that vanishes reads as "no data" rather than "wrong
                // accessor", which is exactly how a missing audit hides.
                picks: safe(() => pickAudit.slice(-40), null),
                cap: safe(() => window.pineBot.capStatus(), null),
                graduation: safe(() => graduationStatus(), null),   // v6.125.0: the immortal stop rule, live
                bossHit: safe(() => window.pineBot.bossHitRange(), null)
            });
            // The same headline block the overlay prints, as a string — so a
            // quick "how is it going" needs neither a paste nor a screenshot.
            window.pineBot.summary = () => reportSummary(reportRaw());
            window.pineBot.resetMarkAudit = () => {
                markAudit = { buckets: {}, runs: 0 };
                try { localStorage.removeItem(MARK_AUDIT_KEY); } catch (e) { }
                return 'mark audit cleared';
            };
            window.pineBot.resetIncomeAudit = () => {
                incAudit = { buckets: {}, runs: 0 };
                incCursor.t = null; incCursor.hp = null;
                try { localStorage.removeItem(INC_AUDIT_KEY); } catch (e) { }
                return 'income audit cleared';
            };
            window.pineBot.resetDamageAudit = () => {
                dmgAudit = { n: 0, hp: 0, cls: {}, sole: {}, none: { n: 0, hp: 0, bossD: [], near: [] }, ev: [], runs: 0 };
                try { localStorage.removeItem(DMG_AUDIT_KEY); } catch (e) { }
                return 'damage audit cleared';
            };
            window.pineBotDiagnose = diagnose;
            window.pineBotStats = buildStatsReport;
        } catch (e) { log('BOOT API FAILED: ' + (e && e.message)); }   // v6.87.3: was a silent catch; a missing hook cost an hour
        if (CONFIG.autoStart) setTimeout(startBot, 900);
        // v6.83.1: end-to-end release test — no behaviour change. If this line
        // shows in the console after a self-update, the whole pipeline works.
        log('v' + scriptTag() + ' loaded (scoring profile: ' + CONFIG.scoringProfile + '). window.pineBot available — pineBot.compare() for the version table.');
        log('release pipeline check: 6.83.2 arrived via Violentmonkey AUTO-UPDATE ✔');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

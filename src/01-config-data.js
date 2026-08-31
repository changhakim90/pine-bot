// ==UserScript==
// @name         Pine & Co Auto Survivor
// @namespace    https://pineandco.online/
// @version      6.83.0
// @description  Autonomous player for Pine & Co. Reads the game's real internals (lexical globals + exported functions), plans movement on true coordinates, dodges projectiles / drop marks / dash lanes, and drives every menu through the game's own API. Optimises for TIME + DOWNS + SALES and pushes toward super cocktails and the Rainbow Gun. Stops on a Hell-mode high score so you can type your own name.
// @author       you
// @match        https://pineandco.online/*
// @match        https://www.pineandco.online/*
// @match        http://pineandco.online/*
// @grant        none
// @run-at       document-idle
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
    const SCRIPT_VERSION = '6.83.0';
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

        // USER-PRESCRIBED ROADMAP (overrides self-composition while set; set
        // to null to return to data-derived rosters). PAT survival/ultimate
        // build: shield+armor+lifesteal defense, gatling+flame offense,
        // vermouth pair -> BLACK VERMOUTH, TOMATO JUICE for ult uptime.
        // MINT added from the recipe book: SOUTH SIDE's super KEY — without
        // it that super can never unlock.
        // BLOODY MARY: TOMATO JUICE double-dips (ult cooldown + its super key).
        // DRY MARTINI: OLIVE double-dips (armor + its super key) — and its
        // slowing olive orbit fits the tank theme. SIX cocktails = six supers
        // = the Rainbow Gun threshold, entirely inside this build.
        // USER ROSTER (revised): MOJITO promoted to full member (SUGAR key),
        // VODKA CRANBERRY retired. Every super key is covered:
        //   VODKA MARTINI->DRY VERMOUTH  SOUTH SIDE->MINT  NEGRONI->CAMPARI
        //   BLOODY MARY->TOMATO JUICE    DRY MARTINI->OLIVE  MOJITO->SUGAR
        //   + SWEET VERMOUTH (HP + slot). ULT first, SHAKING second, zero
        //   junk picks — upgrades and super-evolution potential only.
        // MINGUK STALL ROSTER (user): CAPPED AT FIVE completable supers by
        // design — GIN TONIC + VODKA TONIC share one TONIC key, WHISKY SOUR's
        // LEMON stays banned, MOJITO is excluded (SUGAR = pure luck stat) —
        // so the six-super rainbow gate can NEVER trigger and level-up pools
        // keep offering the time-pause extensions instead.
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
            poHugPad: 8,
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
            poEngageRange: 150,    // "in range" for the probe clock
            poFocusValue: 26,
            poBlockPenalty: 18,    // its body is impassable (the game pushes you out) — not painful, just in the way
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
            laneEscapePad: 8,         // clear the band by this much before releasing
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
            parkOliveLv: 6,         // fallback only (see armorLevel): defense = 5.832 x OLIVE
            parkDefense: 30,
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
            capLegS: 8,            // v6.96.2: seconds per patrol leg before the circuit advances (unused from 6.101.0 — see capStandS)
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
            capStable: { fromS: 2400, hpFloor: 0.97, defMin: 34.9, supersMin: 3, holdS: 300, dipGraceS: 4 },
        // v6.91.2: the real gate. Cap is 34.992; measured live at 34.992.
            parkRegenRate: 1.0,     // HP/s from regenBonus. Measured live at 2.218.
            // v6.112.0: the gate is now max(parkRegenRate, breakEven * this).
            // 1.0 means "park only when regen actually out-heals the contact
            // the anchor will take" — see contactBreakEven(). Set to 0 to
            // restore the pre-6.112.0 flat 1.0 gate exactly.
            //
            // This makes park HARDER to open, on purpose. A bot parked at
            // regen 1.42 against a 1.579 break-even is not surviving, it is
            // dying at 0.16 HP/s with the panic gates switched off — and it
            // books as a seated run, which is how the seat has been scoring
            // credit for runs it was quietly losing. Refusing the seat makes
            // that visible in seatedRate instead of hiding it in the deaths.
            parkRegenBreakEven: 1.0,
            parkRadius: 26,         // "arrived": stop moving inside this radius
            // v6.91.3: how far in from the TRUE corner the seat sits. The
            // mark-immunity geometry is 80.92 px at inset 0, 70.78 at 7.2 (the
            // live player radius, which is what the code used) and 64.03 at 12
            // (the fallback) — against a 70 px mark reach. Anything above ~10
            // puts the seat inside every mark that can spawn.
            cornerInset: 0,
            freezeEntryToS: 2400,   // v6.91.4: the window where a freeze is worth double
            parkYieldS: 20,         // v6.91.4: seconds park may be suspended per frozen-boss episode
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
            enemyMulCeil: 1.4,
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
            invulnFrames: 38,   // hurtPlayer sets player.invuln = 38 (on the PLAYER, not per attacker)
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

        // Strategy weights. These are CEM-TUNABLE (see TUNABLE below), so the
        // strategy itself — not just the dodge physics — improves across runs.
        strategy: {
            deepFocusLv: 4,        // v6.86.0 (was 5): above 4 the roster never completes a super recipe
            roadmapBonus: 16,      // pull toward the USER'S prescribed rainbow roster
            earlyDps: 12,          // extra weight on leveling owned weapons early
            expandPenalty: 20,     // deep-focus penalty on new cocktails
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
    const DAY_ORDER = [
        'TONIC', 'MINT', 'SUGAR', 'OLIVE', 'DRY VERMOUTH', 'SWEET VERMOUTH',
        'BLACK VERMOUTH', 'WATER', 'SIMPLE SYRUP', 'TOMATO JUICE', 'CRANBERRY',
        'SOUTH SIDE', 'MOJITO', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'
    ];   // SIMPLE SYRUP still sits after BOTH its halves (WATER 8, SUGAR 3).
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
    // MAINTENANCE: on the next version bump, empty this. An entry left here
    // after its migration has run re-opens that dimension on every single
    // load, which is a permanent 25% sigma and a search that never converges.
    // `store-guard` asserts the keys match the dims actually widened.
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
    const learnKey = () => CONFIG.learning.storageKey + (activeChar && activeChar !== 'minguk' ? '_' + activeChar : '');
    const SHARED_KEY = CONFIG.learning.storageKey + '_shared';

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
    const DMG_AUDIT_KEY = 'pineBotDmgAudit';
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
    const INC_AUDIT_KEY = 'pineBotIncAudit';
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
    const HUNT_AUDIT_KEY = 'pineBotHuntAudit';
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
    const PAUSE_AUDIT_KEY = 'pineBotPauseAudit';
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
    const PARK_AUDIT_KEY = 'pineBotParkAudit';
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
    const PHASE_AUDIT_KEY = 'pineBotPhaseAudit';
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
    let laneInTicks = 0, laneEscTicks = 0;
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
    const BOSS_CENSUS_KEY = 'pineBotBossCensus_v1';
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

    const MARK_AUDIT_KEY = 'pineBotMarkAudit';
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
            const margin = Math.hypot(m.x - seatX, m.y - seatY) - rGame;
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
    let craftPending = null;    // v6.88.0 AUDIT C1: signature of the fusion prompt we have already clicked
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

// ==UserScript==
// @name         Pine & Co Auto Survivor
// @namespace    https://pineandco.online/
// @version      6.88.5
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
    const SCRIPT_VERSION = '6.88.5';
    // Bump ONLY when computeReward's scale changes. Rewards from different
    // epochs cannot be compared, so a bump clears the reward-derived baselines.
    const REWARD_EPOCH = 2;

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
        preferredBartender: 'minguk',
        bartenderRotation: ['pat', 'minguk'],

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
            cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'VODKA CRANBERRY', 'MOJITO'],
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
                cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'VODKA CRANBERRY', 'MOJITO'],
                ingredients: ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CRANBERRY', 'SUGAR', 'WATER', 'COFFEE BEANS']
            },
            joe: {
                cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'VODKA CRANBERRY', 'MOJITO'],
                ingredients: ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CRANBERRY', 'SUGAR', 'WATER', 'COFFEE BEANS']
            },
            minguk: {
                cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'VODKA CRANBERRY', 'MOJITO'],
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
        maxSuperLines: 5,
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
            lineWeight: 6.5,      // charge lanes (roadLines) — data: the #1 killer once visible
            linePad: 14
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
            tipWindowToS: 4800,        // 80 min
            cornerAnchorFromS: 9000,   // 150 min (user), ALL characters — or
                                       // sooner if a boss ring fills the canvas
            cornerPull: 2.4            // weight on closing to the nearest corner

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
            ultAdjacent: 155
        },

        learning: {
            storageKey: 'pineBotUCB_v5',
            c: 1.25,               // UCB exploration constant (item bandit)
            baselineWindow: 12,
            decay: 0.985,
            tuningWarmupRuns: 3,
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
            deathNudge: 0.03,      // per-generation defensive push against the dominant killer
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
            versionTimesKeep: 600      // per-version survival-time list (median / SD); oldest dropped past this
        },

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
        milestones: { superUnlock: 0.06, craft: 0.05, dayCleared: 0.25, hellEntered: 0.15, rainbow: 0, hellDepth: 0.25, crownProgress: 2.0 },

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
                  ultKind: 'aura', ultReach: 156, ultClearsPassouts: false },
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
    let PLAN_COCKTAILS = ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'VODKA CRANBERRY', 'MOJITO'];
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
    const AVOID_INGREDIENTS_BASE = ['COINTREAU', 'ABSINTHE', 'LEMON', 'ORANGE', 'ANGOSTURA', 'GINGER BEER'];
    // v6.88.3 (user): "lime, soda water can be junk pool picks". They are not
    // plan ingredients and never will be, but when the pool is all junk they
    // are a better answer than CORPSE REVIVER No.2 or ABSINTHE, which cannot
    // damage holdouts at all. Ranked ABOVE true junk, below anything planned.
    const JUNK_ACCEPTABLE = ['LIME', 'SODA WATER'];
    // v6.88.3 (user): Lv6 cocktails that earn their slot WITHOUT a super key.
    const KEYLESS_BOOST = ['WHISKY SOUR', 'NEGRONI', 'VODKA CRANBERRY'];
    // ...and the four that DO carry a key must still outrank them, or the
    // keyless boost quietly demotes the super plan it was meant to sit beneath.
    // (Caught on first measurement: SOUTH SIDE fell to 97 against NEGRONI 136.)
    const SUPER_LINE_COCKTAILS = ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'MOJITO'];

    // =================================================================
    // v6.88.4 PHASE DOCTRINE (user, stated as a strict ordering)
    // =================================================================
    // "The ordering of everything matters." Given verbatim, ingredients first
    // then cocktails. Index 0 is taken first; the bonus is large enough to
    // dominate every other term in the day, because an ORDER that competes
    // with the old weights is not an order.
    const DAY_ORDER = [
        'OLIVE', 'DRY VERMOUTH', 'SWEET VERMOUTH', 'BLACK VERMOUTH', 'WATER', 'SUGAR',
        'SIMPLE SYRUP', 'TOMATO JUICE', 'CRANBERRY', 'MINT', 'TONIC',
        'SOUTH SIDE', 'MOJITO', 'VODKA TONIC', 'GIN TONIC',
        'NEGRONI', 'WHISKY SOUR', 'VODKA CRANBERRY'
    ];
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
    const LAST_RESORT = ['MOSCOW MULE'];
    // Measured band, not a guess. It must sit BELOW the hell-safe junk
    // (COFFEE BEANS 76, LIME 53, SODA WATER 49) so the mule is never sought,
    // and ABOVE true junk (CORPSE REVIVER No.2 20, GINGER BEER 15, ABSINTHE
    // -14) so that when the pool is nothing but junk the mule — which cannot
    // open a sixth super now that GINGER BEER is permanently banned — is what
    // gets eaten. A first attempt at 14 put it under CORPSE REVIVER, which is
    // the one card the roster notes call unable to damage holdouts at all.
    const LAST_RESORT_CEILING = 30;
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
    const WEAPON_TAGS = {
        'GIMLET': ['chain', 'tanky'],                       // lightning chains, slow, hard-hitting
        'MANHATTAN': ['boss', 'burst', 'aoe'],              // cherry-bombs the TOUGHEST enemy, huge blast
        'OLD FASHIONED': ['aoe'],                           // giant ice rock, wide blast
        'SIDECAR': ['pierce', 'swarm'],                     // wall ricochet, piercing & bursting
        'MOJITO': ['boss', 'sniper', 'swarm'],              // sniper at toughest + shotgun pellets
        'COSMOPOLITAN': ['boss', 'sustained', 'control'],   // gatling freezing darts
        'GIN TONIC': ['aura', 'swarm', 'control'],          // freeze/poison aura, 2x damage
        'WHISKEY HIGHBALL': ['sustained', 'control'],       // gatling fizzy freeze blasts
        'VODKA TONIC': ['homing', 'boss'],                  // roaming ice familiars hunt on their own
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
        xp: 26, gem: 26, exp: 26, star: 20,   // XP-style drops: levels are the build engine
        // gold funds weapon upgrades (user-verified: vital) — never trash-tier
        bill: 22, coin: 14, health: 14, _default: 16
    };

    // =================================================================
    // TUNABLE PARAMETERS (auto-tuned across runs)
    // =================================================================
    // Bounds widened at gen 73: the CEM means were PINNED at the old maxima
    // on standoff / standoffPull / projWeight / panicHp (and near-pinned on
    // enemyRange) — the learner wanted more caution than the box allowed.
    const TUNABLE = {
        'movement.smoothing': { min: 0.2, max: 0.85 },
        'movement.standoff': { min: 55, max: 260 },
        'movement.standoffPull': { min: 0.0, max: 2.5 },
        'movement.lootPull': { min: 0.3, max: 2.0 },
        'movement.panicHp': { min: 0.2, max: 0.75 },
        'movement.lookaheadMs': { min: 140, max: 420 },
        'threat.enemyWeight': { min: 0.5, max: 3.5 },
        'threat.enemyRange': { min: 110, max: 320 },
        'threat.projWeight': { min: 1.0, max: 9.0 },
        'threat.projLookaheadMs': { min: 300, max: 1100 },
        'threat.markWeight': { min: 5.0, max: 20.0 },   // measured mark damage ~93: two landings can end a run
        'threat.lineWeight': { min: 2.0, max: 9.0 },
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
        'movement.hellCautionMul': { min: 0.8, max: 2.2 },
        'movement.passoutValue': { min: 18, max: 54 },   // floored+widened: every passout must die before the finale (user)
        'movement.wallSiegeValue': { min: 12, max: 42 },
        'movement.bossEngageValue': { min: 10, max: 36 }
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
    let hitTypeRun = {};
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
    let lastHpSample = null;   // for damage-weighted death attribution
    const slowPadRef = { v: 1 };   // live slow-scaled safety multiplier (set each plan tick)
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
        try { return loadLearnInner(); }
        catch (e) {
            log('STORE UNREADABLE (' + (e && e.message) + ') — starting from defaults; the old blob is kept under ' + learnKey() + '.broken');
            try { localStorage.setItem(learnKey() + '.broken', localStorage.getItem(learnKey()) || ''); localStorage.removeItem(learnKey()); } catch (e2) { }
            try { return loadLearnInner(); } catch (e2) { return blankLearn(); }
        }
    }
    function blankLearn() {
        return {
            bartender: activeChar || 'minguk', items: {}, totalPicks: 0, history: [], runs: 0,
            builds: {}, hof: [], genHistory: [], runLog: [], rosters: {}, versions: {}, snapshots: [],
            rewardEpoch: REWARD_EPOCH, cem: null, linucb: {}
        };
    }
    function loadLearnInner() {
        let d = null;
        try { d = JSON.parse(localStorage.getItem(learnKey())); } catch (e) { }
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
        d.versions = shared.versions || {};
        d.snapshots = shared.snapshots || [];
        if (shared.lastVersion && !d.lastVersion) d.lastVersion = shared.lastVersion;
        d.bartender = activeChar || 'minguk';
        d.items = d.items || {};          // name -> {n, sum}
        d.totalPicks = d.totalPicks || 0;
        d.history = d.history || [];      // recent rewards
        d.runs = d.runs || 0;
        d.builds = d.builds || {};        // primary cocktail -> {n, sum}
        d.hof = d.hof || [];              // hall of fame: top-5 runs ever {r, p}
        d.genHistory = d.genHistory || []; // mean batch reward per generation — the improvement curve
        d.runLog = d.runLog || [];        // last 30 runs, for the 📊 stats report
        d.rosters = d.rosters || {};      // roster id -> {n, sum} (roster experiment bandit)
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
        d.linucb = d.linucb || {};        // card name -> diagonal LinUCB model {n, A[d], b[d]}
        d.rainbowPolicy = d.rainbowPolicy || {};   // 'take' | 'skip' -> {n, sum} (crown-path bandit)
        d.spawnIntel = d.spawnIntel || {};         // enemy class -> {n, sum} of first-seen gameTime (measured timetable)
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
            if (!isFinite(d.cem.pc[k])) d.cem.pc[k] = 0;
            if (!isFinite(d.cem.sigma[k])) d.cem.sigma[k] = range * CONFIG.learning.sigmaInit;
            // When bounds widen between versions, old converged sigmas are too
            // tight to explore the newly opened territory — re-floor them
            // against the CURRENT range so the learner can walk into it.
            if (d.cem.sigma[k] < range * CONFIG.learning.sigmaFloor)
                d.cem.sigma[k] = range * CONFIG.learning.sigmaFloor;
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
        const own = (() => { const { versions, snapshots, ...rest } = learn; return rest; })();
        let ok = true;
        try { localStorage.setItem(learnKey(), JSON.stringify(own)); }
        catch (e) { ok = false; log('SAVE FAILED (own store): ' + (e && e.name) + ' — learning for this run is lost'); }
        try {
            pruneVersions();
            localStorage.setItem(SHARED_KEY, JSON.stringify({
                versions: learn.versions || {}, snapshots: learn.snapshots || [], lastVersion: learn.lastVersion
            }));
        } catch (e) {
            log('SAVE FAILED (shared table): ' + (e && e.name) + ' — comparison history is not being recorded');
            ok = false;
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
        const withData = rows.filter(r => isFinite(r.bestTimeS));
        const bestByTime = withData.slice().sort((a, b) => b.bestTimeS - a.bestTimeS)[0] || null;
        const bestByMean = withData.filter(r => isFinite(r.meanTimeS)).sort((a, b) => b.meanTimeS - a.meanTimeS)[0] || null;
        const bestByP60 = withData.filter(r => isFinite(r.p60) && r.runs >= 20).sort((a, b) => b.p60 - a.p60)[0] || null;
        const epochs = new Set(rows.map(r => r.rewardEpoch).filter(e => e != null));
        return {
            note: epochs.size > 1
                ? 'meanReward spans MULTIPLE reward epochs — compare meanTimeS/bestTimeS instead'
                : 'single reward epoch — all fields comparable',
            current: scriptTag(),
            bestPeak: bestByTime ? { version: bestByTime.version, bestTimeS: bestByTime.bestTimeS } : null,
            bestAverage: bestByMean ? { version: bestByMean.version, meanTimeS: bestByMean.meanTimeS, medianTimeS: bestByMean.medianTimeS, runs: bestByMean.runs } : null,
            bestDeepRunRate: bestByP60 ? { version: bestByP60.version, p60: bestByP60.p60, p120: bestByP60.p120, runs: bestByP60.runs } : null,
            howToRead: 'bestPeak is a lottery that grows with run count. Judge versions on medianTimeS / p60 / p120 and the vsPrev z-score.',
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
            if (learn.enemyTypeMul) delete learn.enemyTypeMul;
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
                c.mean[k] = Math.min(spec.max, c.mean[k] + (spec.max - spec.min) * mag);
            }
            log('CEM: defensive nudge against death by', dom, '(share', Math.round(share * 100) + '%, mag', mag.toFixed(3) + ')');
        }
        c.batch = [];
        c.gen++;
        log('CEM refit → generation', c.gen);
    }

    const DEATH_POOLS = {
        proj: ['threat.projWeight', 'threat.projLookaheadMs', 'movement.smoothing'],
        contact: ['threat.enemyWeight', 'movement.standoff', 'movement.standoffPull', 'threat.enemyRange', 'movement.panicHp'],
        mark: ['threat.markWeight', 'movement.lookaheadMs'],
        line: ['threat.lineWeight', 'movement.lookaheadMs'],
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
                const kLv = Math.min(kMax, (ownedLevels[key] || 0) + (type === 'passive' ? 1 : 0));
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
        if (!atCap && /WHISKY\s*SOUR/i.test(name) &&
            (enemyMix.boss > 0.5 || hellDetected || (lastPlan && lastPlan.boss)))
            add(12, 'boss-freeze');

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
            if (rank >= 0) add((DAY_ORDER.length - rank) * 200, 'day-order' + (rank + 1));
            // TWO THINGS SIT ABOVE THE WHOLE LIST, and both are the user's own
            // doctrine rather than an exception to it:
            //   the ULTIMATE — "ultimates used to kill passouts as priority for
            //     early loot and reward upgrades". The day IS the funding phase.
            //   SHAKING UP (base attack) — super evolution requires "base attack
            //     MAX + cocktail Lv6 + key ingredient MAX". Rank the base below
            //     seventeen other cards and NO super ever evolves, which would
            //     silently delete the four-line plan the order exists to build.
            if (type === 'ult') add((DAY_ORDER.length + 2) * 200, 'day-ult-first');
            else if (type === 'base') add((DAY_ORDER.length + 1) * 200, 'day-base-second');
        }
        // HELL: the plan is BUILT. The job is no longer to assemble it but to
        // avoid opening the six-maxed-super Rainbow Gun gate, so the safe junk
        // the user named becomes a real pick rather than a last resort.
        if (hellDetected && !atCap && HELL_SAFE_JUNK.includes(name)) {
            add(26, 'hell-safe-junk');
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
        if (!atCap && type === 'weapon' && KEYLESS_BOOST.includes(name)) {
            add(46 + (hellDetected ? 20 : 0), 'keyless-core');
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
        if (!atCap && type === 'passive' && TOP_INGREDIENTS.includes(name)) {
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
            // CROWN RULES (6.74) — HELL PREP: NEGRONI must be a SUPER cocktail
            // before the finale — the hell boss rush shreds unprepared builds
            // (observed: a 0-super hell entry died in 50s). From mid-day on,
            // if SUPER NEGRONI doesn't exist yet, everything on its path jumps
            // the queue: NEGRONI levels, CAMPARI (its key), and the super card.
            if (!hellDetected && ![...supersMade].some(n => /NEGRONI/i.test(n)) && gamePhase() !== 'early') {
                if (type === 'weapon' && name === 'NEGRONI' && !atCap) add(14, 'hell-prep');
                if (type === 'passive' && name === 'CAMPARI' && !atCap) add(20, 'hell-prep');
                if (type === 'super' && /NEGRONI/i.test(name)) add(30, 'hell-prep');
            }
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
    function opensNewSuperLine(type, name) {
        try {
            const sl = (G.player && G.player.superLv) || {};
            const has = c => {
                const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                return Object.keys(sl).some(s2 => s2.toLowerCase().replace(/[^a-z0-9]/g, '') === k && sl[s2] > 0);
            };
            if (type === 'weapon') {
                if (!COCKTAILS.includes(name) || has(name)) return false;
                return isMaxed(SUPER_KEY_INGREDIENT[name]);          // key already maxed: this completes it
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
            const CAP = CONFIG.maxSuperLines || 5;
            const nSupers = Math.max(supersMade.size, liveSuperCount());
            // the sixth super IS the gun — refuse the unlock card...
            if (type === 'super' && nSupers >= CAP) add(-500, 'gun-guard');
            // ...and refuse anything that would OPEN a sixth line in the
            // first place (user: block it when picking weapons/ingredients).
            if (nSupers >= CAP && (type === 'weapon' || type === 'passive') &&
                opensNewSuperLine(type, name)) add(-500, 'gun-guard-source');
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
        if (atCap) add(-40, 'maxed');
        // audit fix: measured means used to count TWICE (priority tables AND
        // ucb both scale with the same mean) — that double vote is what kept
        // dragging picks toward off-plan measured favorites. Once an item has
        // real data (n>=3), the ucb term is halved to a tiebreaker.
        add(ucbScore(name) * (((learn.items[name] || {}).n || 0) >= 3 ? 0.5 : 1), 'ucb');
        add(ctxLearnBonus(name, pickContext()), 'ctx-learn');   // contextual bandit layer (LinUCB)

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
            gunRiskExempt = nS < 5 && !opensNewSuperLine('weapon', name) &&
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
        const best = scored[0];
        if (!best) return false;

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
        else if (best.type === 'rainbowup') { rainbowThisRun = true; rainbowAt = Date.now(); }

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

        lastLevelUpAt = Date.now();
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
        const crown = (typeof liveCrownTimeS === 'function' ? liveCrownTimeS() : 0) || CONFIG.crownTimeS || 14025;
        return depth + ms.crownProgress * (t / crown);
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
        lastPoolSig = null;
        lastPoolRef = null;
        levelupStuckAt = 0;
        hellDetected = pendingHellEntry;   // we took the hell entrance — this run IS hell
        hellEnteredAt = pendingHellEntry ? Date.now() : 0;
        pendingHellEntry = false;
        deathSnapshot = null;
        dangerAccum = { contact: 0, proj: 0, mark: 0, line: 0, rival: 0 };
        lastHpSample = null;
        enemyMix = { swarm: 0, ranged: 0, bomber: 0, boss: 0, total: 0 };
        computeRoadmap();   // the plan itself learns: re-derive from live build stats
        AVOID_INGREDIENTS = new Set(AVOID_INGREDIENTS_BASE);   // day rules until hell is latched
        hellUnbanApplied = false;
        if (hellDetected) applyHellUnban();
        killRate = 0; lastKillCount = null; lastKillAt = 0;
        pressureAvg = 0; toughnessAvg = 1; dpsDeficit = 0; passoutAvg = 0;
        supersThisRun = 0; craftsThisRun = 0; rainbowThisRun = false; dayClearedThisRun = false;
        rainbowAt = 0;
        rainbowChoice = null;
        lastLevelUpAt = Date.now();
        supersMade = new Set();
        runPickCtx = [];
        beginTrial();
        log('run started; roster', activeRoster, '| CEM gen', learn.cem.gen, 'batch', learn.cem.batch.length + '/' + CONFIG.learning.batchSize, 'tab', TAB_ID);
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
                for (const k of Object.keys(hitTypeRun)) {
                    const share = hitTypeRun[k] / totalHit;
                    const target = 1 + 3 * share;
                    mul[k] = Math.max(0.6, Math.min(2.2, 0.85 * (mul[k] || 1) + 0.15 * target));
                }
                for (const k of Object.keys(learn.enemyTypeMul)) {
                    if (!(k in hitTypeRun)) learn.enemyTypeMul[k] = 0.9 * learn.enemyTypeMul[k] + 0.1;
                }
            }
            hitTypeRun = {};
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
            const yes = document.querySelector('#craftBtn, .craft-yes, .craft-ok');
            let target = (yes && visible(yes)) ? yes : null;
            let label = target ? (target.textContent || 'craft').trim() : '';
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
                    log('craft confirmed: ' + craftPending + ' (total ' + craftsThisRun + ')');
                    craftPending = null;
                }
                return false;
            }
            const sig = (target.id || '') + '|' + label.slice(0, 40);
            if (sig === craftPending) return true;   // already clicked THIS prompt — wait it out
            craftPending = sig;
            clickEl(target);
            setStatus('craft: ' + label.slice(0, 24));
            return true;
        } catch (e) { }
        return false;
    }

    // =================================================================
    // SCREEN AUTOMATION — driven by the game's own `state`
    // =================================================================
    function chooseBartender() {
        let b = null;
        if (CONFIG.preferredBartender && CHARS[CONFIG.preferredBartender]) b = CONFIG.preferredBartender;
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
        if (hellLexicalFlag()) { hellDetected = true; hellEnteredAt = Date.now(); log('HELL run latched (lexical flag)'); return; }
        if (CONFIG.hellModeRegex.test(bodyText())) { hellDetected = true; hellEnteredAt = Date.now(); log('HELL run latched (HUD text)'); }
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
            // Secret crafts are always an upgrade — accept, and pick the best option.
            const choices = safe(() => window._craftPool, null) || safe(() => window._cpool, null);
            if (Array.isArray(choices) && choices.length && hasGame('pickCraftChoice')) {
                const best = choices.map(scoreCard).sort((a, b) => b.score - a.score)[0];
                if (best) {
                    runPicks.push(best.name);
                    runPickCounts[best.name] = (runPickCounts[best.name] || 0) + 1;
                    ownedLevels[best.name] = Math.max(ownedLevels[best.name] || 0, 1);
                    craftsThisRun++;
                    callGame('pickCraftChoice', best.index);
                    return true;
                }
            }
            if (hasGame('confirmCraft')) { craftsThisRun++; callGame('confirmCraft'); return true; }
            if (hasGame('pickCraftChoice')) { craftsThisRun++; callGame('pickCraftChoice', 0); return true; }
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
                        hellDetected = true; hellEnteredAt = Date.now(); dayClearedThisRun = true;
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
                            hellEnteredAt = Date.now();
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

    function gatherThreats(p) {
        const out = {
            enemies: [], projectiles: [], marks: [], lines: [], near: 0, boss: false,
            passouts: [],
            mix: { swarm: 0, ranged: 0, bomber: 0, boss: 0, total: 0 }
        };
        const R = CONFIG.threat.enemyRange;

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
                        const dpo0 = Math.hypot(e.x - p.x, e.y - p.y);
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
                const dRaw = Math.hypot(e.x - p.x, e.y - p.y);
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
                const distantBoss = d > R && t0 === 'boss' && d < 480 &&
                    (!hellDetected || (typeof e.r === 'number' && e.r <= 90) || frozenNow) &&
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
                    ? Math.hypot(e.x - e.partner.x, e.y - e.partner.y) : Infinity;
                const freezeAura = t === 'boss' && pairDist < GZ_PAIR_DIST * 2.2;
                // USER: with OLIVE armor stacked, rushing commons barely
                // scratch — fear of non-boss mobs scales DOWN with armor
                // (up to -36% at OLIVE 6), so the bot stands and grinds.
                const gtDay = safe(() => gameTime, 0) || 0;
                const armorEase = ((t !== 'boss' && !isWall)
                    ? 1 - 0.06 * Math.min(6, ownedLevels['OLIVE'] || 0) : 1) *
                    ((t !== 'boss' && !isWall && gtDay < 1200 && !hellDetected) ? 1.15 : 1);   // DAY: commons are avoided, not absorbed (manual run crowd median 0)
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
                    w: prof.weight * armorEase,
                    wall: isWall, boss: t === 'boss', stationary: isStationary, chaserFast, freezeAura,
                    frozen, frozenLeft, distant: distantBoss, t: t0,
                    // v6.85.19: centre beyond the field bounds — most of the
                    // hit circle is unreachable, so any standoff ring must
                    // collapse to the sliver of body that pokes on-canvas.
                    offCanvas: (() => { const fw2 = safe(() => W, 540) || 540, fh2 = safe(() => H, 540) || 540;
                        return e.x < 0 || e.x > fw2 || e.y < 0 || e.y > fh2; })()
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
                    const pairD = Math.hypot(e.x - e.partner.x, e.y - e.partner.y);
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
                if (Math.hypot(q.x - p.x, q.y - p.y) > 340) continue;   // see boss volleys a beat earlier
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
            for (const e of out.enemies) if (!e.wall && Math.hypot(e.x - x, e.y - y) < r) n++;
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
            const dd = Math.hypot(p.x - rv.x, p.y - rv.y) || 1;
            out.rival = { x: rv.x, y: rv.y, d: dd };
            out.enemies.push({
                x: rv.x, y: rv.y,
                vx: (p.x - rv.x) / dd * spd, vy: (p.y - rv.y) / dd * spd,   // it chases US
                r: 30, reach: 280, w: 5, boss: false, wall: false, stationary: false, rival: true
            });
            out.mix.boss++; out.mix.total++;
        }

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
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
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
                return Math.hypot(x - px, y - py) < (l.thickness || l.w || 26) / 2 + pad ? 1 : 0;
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

    function gatherLoot(p, hpRatio) {
        const out = [];
        const ps = G.pickups;
        if (!Array.isArray(ps)) return out;
        let floorCount = 0;
        for (const it of ps) if (it && it.taken !== true && it.dead !== true) floorCount++;
        for (const it of ps) {
            if (!it || typeof it.x !== 'number' || typeof it.y !== 'number') continue;
            if (it.taken === true || it.dead === true) continue;
            if (Math.hypot(it.x - p.x, it.y - p.y) > CONFIG.movement.lootRange) continue;
            const kind = String(it.kind || it.type || '_default').toLowerCase();
            let v = PICKUP_VALUE[kind] ?? PICKUP_VALUE._default;
            let vital = false;
            if (kind === 'health') {
                v = 10 + 70 * (1 - hpRatio);   // near-worthless at full HP, urgent when low
                vital = hpRatio < 0.6;         // hurt: healing must BYPASS every greed discount
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
                if (hellDetected) v += (kind === 'timestop' ? 20 : 14);
                // USER: FLAME CROSS is essential for melting NO BOOKING
                // walls and passout fields — grab it when those targets are up.
                if (kind === 'firecross' && lastPlan) {
                    // USER PRIORITY ORDER for the flame cross: passouts
                    // FIRST, then NO BOOKING walls and bosses, then charge
                    // lanes — the early roster is too weak to melt these,
                    // the cross does it for free. Day phase values it most.
                    const gtF = typeof G.gameTime === 'number' ? G.gameTime : 0;
                    const day = gtF < 1200 && !hellDetected;
                    // v6.85.9 (user): passouts are what the cross is FOR — the
                    // rest of the roster barely scratches them. A cross on the
                    // floor with a passout field up is close to top-priority
                    // loot, not a mild preference. On an empty field it stays
                    // cheap, so the bot leaves it lying there until it pays.
                    if ((lastPlan.passoutsNear || 0) >= 1) v += day ? 55 : 35;
                    else if (lastPlan.wallNear === true || lastPlan.bossNear === true) v += day ? 20 : 14;
                    else if ((lastPlan.lines || 0) > 0) v += 12;
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

    function planMove() {
        const p = G.player;
        if (!p) { moveSource = 'no player binding'; return null; }
        const { w: fw, h: fh } = fieldSize();
        const M = CONFIG.movement, T = CONFIG.threat;
        let poTtkOut = null, poDpsOut = 0;   // v6.86.2 reporting (set by the station block)

        const maxHp = p.maxHp || p.maxHealth || p.hpMax || 100;
        const hp = p.hp != null ? p.hp : (p.health != null ? p.health : maxHp);
        const hpRatio = Math.max(0, Math.min(1, hp / (maxHp || 1)));

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
        const loot = gatherLoot(p, hpRatio);

        // UPGRADE/LOOT SYNC (user directive): the build must hit its power
        // marks ON TIME — roughly the first super by ~11 min and six by the
        // rainbow window. BUILD HUNGER measures how starved the build is
        // (long gap since the last level-up, or supers behind the timetable
        // pace) and re-weights the whole loot hunt toward XP, tips, and
        // farm kills until the cadence recovers.
        const gtH = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const cadenceHunger = Math.min(1, Math.max(0, (Date.now() - (lastLevelUpAt || Date.now())) / 45000));
        const expectedSupers = Math.max(0, Math.min(6, (gtH - 480) / 160));
        const paceHunger = Math.min(1, Math.max(0, (expectedSupers - supersThisRun) / 2));
        const buildHunger = Math.max(cadenceHunger, paceHunger);
        if (buildHunger > 0.25) {
            for (const it of loot) {
                if (['xp', 'gem', 'exp', 'star', 'ingredient', 'bottle', 'tip'].includes(it.kind))
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
        const markW = T.markWeight * (1 + Math.min(1, 3 * mixShare('bomber'))) * hellMul;
        const standoffAdj = M.standoff * (1 + 0.3 * Math.min(1, mixShare('swarm'))) * (hellDetected ? 1.15 : 1) *
            (flameOn ? 0.75 : 1);   // flame active: tighten in, keep the crowd burning

        // ---- Enemy scaling: MEASURE the difficulty curve ----------------
        // Kill rate (our real DPS output, kills/sec, rolling):
        const kc = G.killCount, nowMs = Date.now();
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
        const hellRecent = hellDetected && hellEnteredAt && (Date.now() - hellEnteredAt) < 90000;
        // DEEP-HELL DEPTH (v6.82.0): 0 before CONFIG.deepHell.startS, 1 at
        // fullS. Drives the contact posture below — nothing else.
        const DH = CONFIG.deepHell;
        const gtDeepP = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const depth = hellDetected ? Math.max(0, Math.min(1, (gtDeepP - DH.startS) / Math.max(1, DH.fullS - DH.startS))) : 0;
        // FRESH-GUN WINDOW (user-verified): for ~2.5 min after taking the
        // Rainbow Gun, DPS has cratered and normal play gets the bot killed
        // on contact — survival posture only until the gun scales up.
        const rainbowRecent = rainbowThisRun && rainbowAt && (Date.now() - rainbowAt) < 150000;
        // Surge awareness: the game's own surge window is readable.
        const su = G.surgeUntil, gt = G.gameTime;
        const surgeActive = typeof su === 'number' && typeof gt === 'number' && su > gt;
        // v6.86.1 ULT INVULNERABILITY WINDOW. Both non-nuke ultimates grant
        // real invulnerability while they run — pat's spiral for its whole
        // (1.4+0.13*lv)*1.3 s, joe's Untouchable for 8+0.8*(lv-1) s — and the
        // game's contact loop is gated on `!isInvuln()`. Nothing can hurt us
        // in that window, so caution is wasted there, and for joe RETREATING
        // wastes the ult outright: the spikes only reach player.r + ~149.
        const gtInv = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const ultInvuln = (safe(() => player.ultUntil, 0) > gtInv) ||
            (safe(() => player.ultSpiralUntil, 0) > gtInv);
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
        const armorLv = (ownedLevels['OLIVE'] || 0) + (ownedLevels['NEGRONI'] || 0);
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
        for (const e of th.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) { dangerAccum.contact += 0.25; break; }
        for (const q of th.projectiles) if (Math.hypot(q.x - p.x, q.y - p.y) < q.r * 2.5) { dangerAccum.proj += 0.25; break; }
        for (const m of th.marks) if (Math.hypot(m.x - p.x, m.y - p.y) < m.r) { dangerAccum.mark += 0.25; break; }
        for (const l of th.lines) if (lineCost(l, p.x, p.y)) { dangerAccum.line += 0.25; break; }
        if (lastHpSample != null && hp < lastHpSample - 0.5) {
            const loss = lastHpSample - hp;
            let cls = 'contact';
            if (th.rival && th.rival.d < 150) cls = 'rival';
            else if (th.lines.some(l => l.armed === true && lineCost(l, p.x, p.y) > 0.15)) cls = 'line';
            else if (th.projectiles.some(q => Math.hypot(q.x - p.x, q.y - p.y) < q.r + 22)) cls = 'proj';
            else if (th.marks.some(m => Math.hypot(m.x - p.x, m.y - p.y) < m.r + 10)) cls = 'mark';
            dangerAccum[cls] = (dangerAccum[cls] || 0) + loss * 0.35;

            // v6.85.13 AUDIT — record the EVIDENCE, never a verdict. Same
            // predicates and thresholds as the chain above, but evaluated
            // independently instead of first-match-wins, so we can see how
            // often a class was the SOLE candidate (ground truth), how often
            // it merely co-occurred, and how often NOTHING was in range —
            // which the chain silently books as 'contact'.
            const nearestGap = (arr, f) => { let b = Infinity; for (const it of arr) { const v = f(it); if (v < b) b = v; } return b; };
            const gContact = nearestGap(th.enemies, e2 => Math.hypot(e2.x - p.x, e2.y - p.y) - e2.r);
            const gProj = nearestGap(th.projectiles, q => Math.hypot(q.x - p.x, q.y - p.y) - q.r);
            const gMark = nearestGap(th.marks, m => Math.hypot(m.x - p.x, m.y - p.y) - m.r);
            const gBoss = nearestBossRef.v;   // field-wide, not capped at enemyRange
            const cands = [];
            if (th.rival && th.rival.d < 150) cands.push('rival');
            if (th.lines.some(l => l.armed === true && lineCost(l, p.x, p.y) > 0.15)) cands.push('line');
            if (gProj < 22) cands.push('proj');
            if (gMark < 10) cands.push('mark');
            if (gContact < 6) cands.push('contact');
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
            // the per-type attribution for the learned threat multiplier.
            let nearT = null, nearTD = 140;
            for (const e2 of th.enemies) {
                const dd2 = Math.hypot(e2.x - p.x, e2.y - p.y);
                if (dd2 < nearTD) { nearTD = dd2; nearT = e2.t || (e2.boss ? 'boss' : 'mob'); }
            }
            if (nearT) {
                hitTypeRun[nearT] = (hitTypeRun[nearT] || 0) + loss;
                const bt = dmgAudit.byType || (dmgAudit.byType = {});
                const b2 = bt[nearT] || (bt[nearT] = { n: 0, hp: 0 });
                b2.n++; b2.hp += loss;
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
        const hpPanic = !ultInvuln && hpRatio < M.panicHp * charOf().panicMul * panicArmor * (1 + 0.25 * late);
        // USER: NEGRONI + OLIVE make mob rushes survivable — every 3 combined
        // defense levels raise the crowd threshold by 1, so an armored bot
        // keeps farming bosses/passouts/walls through a rush instead of
        // sprinting for a corner.
        const crowdTol = M.crowdedCount +
            Math.round(((ownedLevels['NEGRONI'] || 0) + (ownedLevels['OLIVE'] || 0)) / 3) +
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
        let cx = 0, cy = 0, chasers = 0;
        for (const e of th.enemies) {
            if (e.wall || (e.boss && e.stationary)) continue;
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
        let kite = null;
        // v6.87.0: same bet, same per-character answer. Owning SOUTH SIDE (or
        // a fresh rainbow) still buys one chaser of impatience, because the
        // sweep is what drags the train across the burning ground.
        const kiteAt = Math.max(2, (charOf().kiteChasers || 3) - ((zoner || rainbowRecent) ? 1 : 0));
        if (chasers >= kiteAt && !panic) {
            const rx = p.x - cx, ry = p.y - cy;
            const rm = Math.hypot(rx, ry) || 1;
            const t1 = { x: -ry / rm, y: rx / rm }, t2 = { x: ry / rm, y: -rx / rm };
            kite = (t1.x * lastDir.x + t1.y * lastDir.y) >= (t2.x * lastDir.x + t2.y * lastDir.y) ? t1 : t2;
        }

        // GAP ESCAPE: when surrounded, find the widest angular gap between
        // nearby enemies and drive through it — greedy per-direction danger
        // alone can leave every option looking equally bad.
        let escape = null;
        if (th.near >= crowdTol) {
            const angs = [];
            for (const e of th.enemies) {
                if (Math.hypot(e.x - p.x, e.y - p.y) < 140) angs.push(Math.atan2(e.y - p.y, e.x - p.x));
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
            (slowMul < 0.7 && th.enemies.some(e => e.boss && !e.wall && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 55));
        // LATE-HELL SPRINTERS (user): mobs faster than even minguk closing
        // to contact range = dash through/past them, don't try to outwalk.
        const sprinterUrgent = hellDetected &&
            th.enemies.some(e => !e.wall && !e.boss && e.chaserFast && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 80);

        let laneUrgent = false;
        for (const l of th.lines) {
            const inBand = lineCost(l, p.x, p.y);
            if (inBand <= 0.15) continue;                 // clear of this lane
            if (l.armed === true) { laneUrgent = true; break; }   // charge is LIVE: go now
            // TELEGRAPH WINDOW (source: 210-frame life, arms for the last 90).
            // Standing in the band as it approaches arming is the moment to
            // dash — once it arms, walking out is already too late.
            if (typeof l.life === 'number' && l.life <= 130) { laneUrgent = true; break; }
            // no life field to read: treat deep-in-band telegraphs as urgent
            if (inBand > 0.55) { laneUrgent = true; break; }
        }

        let projImminent = false;
        for (const q of th.projectiles) {
            let pvx = q.vx, pvy = q.vy;
            if (q.home) {
                const dd = Math.hypot(p.x - q.x, p.y - q.y) || 1;
                pvx = (p.x - q.x) / dd * q.home;
                pvy = (p.y - q.y) / dd * q.home;
            }
            const sp2 = pvx * pvx + pvy * pvy;
            if (sp2 < 0.25) continue;
            const t = ((p.x - q.x) * pvx + (p.y - q.y) * pvy) / sp2;   // frames to closest approach
            if (t > 0 && t < 18) {
                const cax = q.x + pvx * t, cay = q.y + pvy * t;
                if (Math.hypot(cax - p.x, cay - p.y) < q.r + 6) { projImminent = true; break; }
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
            if (e.wall) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) > 200) continue;
            if (e.frozen) frozenNear++; else movingNear++;
        }
        const pauseActive = frozenNear > 0 && movingNear <= Math.max(1, Math.round(frozenNear * 0.25));

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
        const flight = hellDetected && !pauseActive && unkillable && th.near >= fleeNear && !ultInvuln;
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
        const markHere = th.marks.some(m => !m.drop && Math.hypot(m.x - p.x, m.y - p.y) < m.r + 50);
        // live enemy fire anywhere near us: do NOT plant — keep moving
        const projHere = th.projectiles.some(q =>
            Math.hypot(q.x - p.x, q.y - p.y) < q.r + 130);
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
            th.passouts.some(po => !po.contested && !po.far && Math.hypot(po.x - p.x, po.y - p.y) < 260);
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
                (Math.hypot(po.x - p.x, po.y - p.y) - po.r) < M.poEngageRange * 0.5);
        const anchor = flameAnchor || holdoutAnchor || (!hpPanic && hpRatio > 0.7 && !markHere && !projHere && !th.rival && !rainbowRecent && !flight &&
            (!dayPhaseNow || th.near <= 2 + charOf().anchorBias * 2) &&   // day: only anchor on a quiet field (manual run: crowd median 0)
            ((ownedLevels['OLIVE'] || 0) >= 2 || (ownedLevels['NEGRONI'] || 0) >= 2) &&
            (wallFocus || th.passouts.some(po => !po.contested && Math.hypot(po.x - p.x, po.y - p.y) < 220)));
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
        const ringHuge = th.enemies.some(e => e.boss && (e.r || 0) * 2 >= canvasW * 0.55);
        const cornerOn = !hpPanic && !markHere && !flight &&
            (ringHuge || gtCorner > (CONFIG.deepHell.cornerAnchorFromS || 9000));
        const fieldW = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
        const fieldH = (typeof G.H === 'number' && G.H > 0) ? G.H : CONFIG.field.h;
        const pr = (typeof p.r === 'number' && p.r > 0) ? p.r : 12;
        const cnrX = (p.x < fieldW / 2) ? pr : fieldW - pr;
        const cnrY = (p.y < fieldH / 2) ? pr : fieldH - pr;
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
        const dayFarm = ((!hellDetected && gtNow2 < 60) ? 1.7 : ((gtNow2 < 1200 && !hellDetected) ? 1.35 : 1)) *
            (1 + 0.45 * buildHunger) *  // starving build: kills ARE the upgrades — hunt harder
            (flameOn ? 1.6 : 1) *       // burn window: harvest everything it touches
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
        let poCx = 0, poCy = 0, poN = 0, poW = 0, poNearest = null;
        for (const po of th.passouts) {
            if (po.contested) continue;
            const dpo = Math.hypot(po.x - p.x, po.y - p.y);
            if (dpo >= 240) continue;
            const w = ultFall ? 1 / (dpo + 60) : 1;
            poCx += po.x * w; poCy += po.y * w; poW += w; poN++;
            if (poNearest == null || dpo < poNearest) poNearest = dpo;
        }
        if (poW) { poCx /= poW; poCy /= poW; }
        // v6.86.4: banking is only worth positioning for when the blast is near
        // v6.86.12: banking only makes sense for an ult that must be NEAR its
        // targets. Minguk's nuke hits every enemy on the field at any range
        // and explicitly includes passouts, so walking his 120 HP into the
        // pile at 4x the normal pull weight buys nothing and spends the
        // spacing that keeps a runner alive. Harvest is for melee ults.
        const meleeUlt = charOf().ultKind && charOf().ultKind !== 'nuke';
        const ultHarvest = meleeUlt && poN >= 1 && (ultReadyNow || ultInS <= M.ultHarvestLeadS) &&
            !hpPanic && !markHere && !projHere;

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
                if (Math.hypot(fx2 - p.x, fy2 - p.y) < e.r + pad) { contactImminent = true; break; }
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
                const dd = Math.hypot(e.x - p.x, e.y - p.y);
                if (!stopBoss || dd < stopBoss.d) stopBoss = { x: e.x, y: e.y, d: dd, r: e.r, left: e.frozenLeft };
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
                const d = Math.hypot(x - p.x, y - p.y);
                if (d > M.flameAimRange) return;
                const sc = w / (1 + d / 200);
                if (sc > bestF) { bestF = sc; flameTarget = { x, y, d }; }
            };
            for (const po of th.passouts) if (!po.far) consider(po.x, po.y, 3);
            for (const e of th.enemies) consider(e.x, e.y, e.wall ? 2.5 : (e.boss ? 2 : 1));
        }

        let best = null;
        const N = M.samples;
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
            let candNearestLive = Infinity;
            for (const e of th.enemies) {
                if (e.wall) continue;
                const de = Math.hypot(nx - e.x, ny - e.y) - (e.r || 0);
                if (de < candNearestLive) candNearestLive = de;
            }

            let danger = 0;

            for (const e of th.enemies) {
                // v6.88.0 AUDIT D3: a distant boss is gathered ONLY so the
                // firing-ring term can see it. Letting it into the danger field
                // made the planner flee the target it was being paid to close on.
                if (e.distant) continue;
                const fx = e.x + e.vx * stepFrames;
                const fy = e.y + e.vy * stepFrames;
                const d = Math.hypot(nx - fx, ny - fy);
                // a SAFELY frozen boss during the stacking window is not a
                // threat — it is the target; skip all its repulsion costs
                if (stopBoss && e.frozen && e.frozenLeft >= 45 && e.boss && !e.wall) continue;
                if (e.wall) {
                    // Impassable and pins you, but never chases. USER REPORT:
                    // the bot was bumping into walls mid-siege — the old cost
                    // was a binary cliff at r+8, so the planner parked 1px
                    // outside it and jitter shoved it in. Now: a hard
                    // no-touch core, a GRADED approach band above it, and a
                    // path check so no step cuts across the body.
                    if (d < e.r + 10) danger += 90;
                    else if (d < e.r + 26) danger += 30 * (1 - (d - e.r - 10) / 16);
                    else if (distPointSeg(fx, fy, p.x, p.y, nx, ny) < e.r + 10) danger += 90;
                    continue;
                }
                // CONTACT BUFFER (user-verified: ALL bosses deal contact
                // damage): the hitbox itself is maximal cost, and a graded
                // band just outside it — wider for bosses, whose bodies both
                // hit harder and lunge — keeps the bot from grazing.
                // DEEP HELL (v6.82.0): giant bosses lunge further than their
                // sprite — the graded band and the fear radius widen with depth
                const deepBand = (e.boss || e.rival) ? (1 + (DH.bossPadMul - 1) * depth) : 1;
                const cpad = (e.rival ? 40 : (e.boss ? (e.chaserFast ? 40 : 24) : 10)) * deepBand;
                const reachD = e.reach * ((e.boss && !e.wall) ? (1 + (DH.reachMul - 1) * depth) : 1);
                if (d < e.r) danger += (e.rival ? 90 : 40) * e.w * caution;             // contact hurts more late-game; rival = half max HP
                else if (d < e.r + cpad) danger += (e.rival ? 45 : (e.boss ? 26 : 10)) * e.w * caution * (1 - (d - e.r) / cpad);
                else if ((e.boss || e.rival) && distPointSeg(fx, fy, p.x, p.y, nx, ny) < e.r)
                    danger += 40 * e.w * caution;                                       // stepping THROUGH a boss body still hurts
                else if (d < reachD) danger += T.enemyWeight * caution * e.w *
                    ((reachD - d) / reachD) * 6 * (e.stationary ? 0.45 : 1) * ((e.boss && !e.stationary) ? 1.25 : 1) *
                    ((anchor && !e.boss && !e.rival) ? 0.65 : 1);   // anchored: commons don't push us off the farm
            }

            for (const q of th.projectiles) {
                // HOMING projectiles chase the player — predict along the
                // pursuit vector, not the (possibly misleading) current vx/vy.
                let pvx = q.vx, pvy = q.vy;
                if (q.home) {
                    const dd = Math.hypot(p.x - q.x, p.y - q.y) || 1;
                    pvx = (p.x - q.x) / dd * q.home;
                    pvy = (p.y - q.y) / dd * q.home;
                }
                // PERSISTENT FLOATING HAZARDS (source-verified: the feed
                // boss's posts sit at vx=vy=0 with 300+ frames of life and
                // damage on bump): a static projectile is a NO-GO disc, not
                // a passing threat — pad it and route around, graded band.
                if (!q.home && (pvx * pvx + pvy * pvy) < 0.09) {
                    const rr = q.r + T.projPad;
                    const dNowH = Math.hypot(p.x - q.x, p.y - q.y);
                    const dEnd = Math.hypot(nx - q.x, ny - q.y);
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
                    const dq = Math.hypot(nx - q.x, ny - q.y);
                    if (dq < q.r + 28) danger += projW * q.w * 6 * (1 - dq / (q.r + 28));
                }
                // sample along the projectile's path, not just its endpoint
                for (let k = 0.25; k <= 1.0001; k += 0.25) {
                    const px = q.x + pvx * projDt * k;
                    const py = q.y + pvy * projDt * k;
                    const d = Math.hypot(nx - px, ny - py);
                    if (d < q.r) { danger += projW * q.w * 14 * (1.1 - k); break; }
                    if (d < q.r * 2.4) danger += projW * q.w * 2 * (1.1 - k);
                }
            }

            for (const m of th.marks) {
                const d = Math.hypot(nx - m.x, ny - m.y);
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
            // strongly worth pre-dodging before the charge fires
            for (const l of th.lines) danger += lineCost(l, nx, ny) * T.lineWeight * hellMul * (l.armed === true ? 14 : 7);

            // Walls pin you when a crowd is pushing: the effective margin
            // widens with nearby pressure so the bot never kites into a corner.
            const mg = CONFIG.field.margin * (1 + 0.8 * Math.min(1, th.near / 6));
            const edge = Math.min(nx, ny, fw - nx, fh - ny);
            if (edge < mg) danger += M.wallWeight * (mg - edge) * 0.9;

            let gain = 0;
            for (const it of loot) {
                const d0 = Math.hypot(p.x - it.x, p.y - it.y);
                const d1 = Math.hypot(nx - it.x, ny - it.y);
                // VITAL pickups (healing while hurt) bypass every greed
                // discount — panic and the hell-entry window suppress loot
                // exactly when a heal is most valuable, which was backwards.
                const pull = it.vital ? M.lootPull * 1.2 : lootMul;
                gain += pull * it.v * (d0 - d1) / Math.max(30, d0);
            }

            // Siege the NO BOOKING walls: they never chase, they block the
            // map, and killing them pays gold + XP. Hold a firing ring just
            // outside their contact zone so weapons melt them — the hard
            // don't-touch cost above still keeps us off their hitbox.
            // USER PRIORITY: when a NO BOOKING mob is up, killing it comes
            // FIRST — its siege pull is boosted and every other farm pull
            // (passouts, boss rings) is muted until it's down (wallFocus).
            if (!hpPanic && !hellRecent && !th.rival && !rainbowRecent) {
                for (const e of th.enemies) {
                    if (!e.wall || e.contested) continue;
                    // firing ring sits OUTSIDE the graded contact band — and
                    // DEMO-TUNED: with a sniper/directed weapon leveled the
                    // user sieges walls from ~280px; the body never closes.
                    const ranged = (ownedLevels['MOJITO'] || 0) >= 3 || (ownedLevels['VODKA MARTINI'] || 0) >= 3;
                    const ring = ranged ? e.r + 140 : e.r + 38;
                    const errNow = Math.abs(Math.hypot(p.x - e.x, p.y - e.y) - ring);
                    const errNew = Math.abs(Math.hypot(nx - e.x, ny - e.y) - ring);
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
                for (const e of th.enemies) {
                    if (!e.boss || e.wall) continue;
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
                        ? (charOf().bossFloor || 0) : 0;
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
                    const errNow = Math.abs(Math.hypot(p.x - e.x, p.y - e.y) - ring);
                    const errNew = Math.abs(Math.hypot(nx - e.x, ny - e.y) - ring);
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
                    const sc = po.maxHp + M.killOrderDist * Math.hypot(po.x - p.x, po.y - p.y);
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
                    const nowPo = Date.now();
                    if (poTrack.id !== tgtPo.id) {
                        poTrack = { id: tgtPo.id, hp: tgtPo.hp, at: nowPo, inRangeS: 0, dps: 0 };
                    } else {
                        const dt = (nowPo - poTrack.at) / 1000;
                        if (dt >= 0.4) {
                            const inRange = (Math.hypot(tgtPo.x - p.x, tgtPo.y - p.y) - tgtPo.r) < M.poEngageRange;
                            if (inRange) poTrack.inRangeS += dt;
                            const drop = poTrack.hp - tgtPo.hp;
                            if (drop > 0) {
                                const inst = drop / dt;
                                poTrack.dps = poTrack.dps > 0 ? poTrack.dps * 0.7 + inst * 0.3 : inst;
                            }
                            poTrack.hp = tgtPo.hp;
                            poTrack.at = nowPo;
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
                    if (poTrack.inRangeS >= M.poProbeS && poTtk > budget && !ultUpSoon) {
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
                    const dr = charOf().dayRing;
                    // v6.85.22: the pat curve now reads CONFIG.patRing so the
                    // CEM can search it. CHARS keeps the calibrated defaults.
                    const dayRing = dr
                        ? (gtRing < 180 ? CONFIG.patRing.early : (gtRing < 600 ? CONFIG.patRing.mid : CONFIG.patRing.late))
                        // DAY (minguk-calibrated): hold ~124px — weapons reach,
                        // falls and contact do not. Tight day rings were the
                        // 7-12 minute contact deaths.
                        : (phR === 'early' ? 118 : phR === 'mid' ? 112 : 105);
                    let ring = po.r + ((hellDetected || gtRing > 1200) ? hellRing * slowPad
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
                    const dNow = Math.hypot(p.x - po.x, p.y - po.y);
                    const d1 = Math.hypot(nx - po.x, ny - po.y);
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
                const errNow = Math.abs(Math.hypot(p.x - cx, p.y - cy) - standoffAdj);
                const errNew = Math.abs(Math.hypot(nx - cx, ny - cy) - standoffAdj);
                // v6.88.2: past the corner-anchor threshold the standoff ring
                // is the thing being overridden — holding a mark-proof corner
                // beats holding a firing distance from a crowd that cannot be
                // outrun anyway (mobs pass the player's speed at ~11 minutes).
                gain += M.standoffPull * (errNow - errNew) * 0.28 * (anchor ? 0.4 : 1) * (cornerOn ? 0.25 : 1);
            }
            // v6.88.2 CORNER ANCHOR pull (see the derivation above).
            if (cornerOn) {
                const cNow = Math.hypot(p.x - cnrX, p.y - cnrY);
                const cNew = Math.hypot(nx - cnrX, ny - cnrY);
                gain += (CONFIG.deepHell.cornerPull || 2.4) * (cNow - cNew) * 0.5;
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
                const eNowT = Math.hypot(p.x - trekPo.x, p.y - trekPo.y);
                const eNewT = Math.hypot(nx - trekPo.x, ny - trekPo.y);
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
                const eNowS = Math.abs(Math.hypot(p.x - stopBoss.x, p.y - stopBoss.y) - stopStation);
                const eNewS = Math.abs(Math.hypot(nx - stopBoss.x, ny - stopBoss.y) - stopStation);
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

            // v6.86.4 HARVEST WINDOW. The demo's whole passout economy is
            // positional: the human drifts onto the pile as the ult comes off
            // cooldown and detonates from ~78px. So the centroid pull is weak
            // background behaviour until the ult is within ultHarvestLeadS,
            // then it becomes the dominant term.
            const ultAimOk = ultFall ? (poN >= 1 && !hpPanic && !markHere && !projHere) : (anchor && poN >= 2);
            if (ultAimOk) {
                const eNow = Math.hypot(p.x - poCx, p.y - poCy);
                const eNew = Math.hypot(nx - poCx, ny - poCy);
                const w = ultHarvest ? M.ultHarvestPull : (ultFall ? 22 : 14);
                gain += w * (eNow - eNew) * 0.15;
            }

            // kiting sweep + gap escape
            // v6.86.1: while joe's Untouchable is up, the spikes are the whole
            // point — walk INTO the densest body cluster inside their reach
            // instead of kiting it. Invulnerable, so this costs nothing.
            if (auraUlt) {
                const reach = charOf().ultReach || 156;
                for (const e of th.enemies) {
                    const d1e = Math.hypot(nx - e.x, ny - e.y), d0e = Math.hypot(p.x - e.x, p.y - e.y);
                    if (d0e < reach * 2.2) gain += (d0e - d1e) * 0.9;
                }
            }
            if (kite && i !== N) gain += (dx * kite.x + dy * kite.y) * M.kitePull * charOf().kiteMul * (zoner ? 1.6 : 1) * (knocker && th.boss ? 1.25 : 1) * (rainbowRecent ? 1.4 : 1) * (anchor ? 0.35 : 1) * (flight ? (grind ? M.grindKiteMul : 1.8) : 1);
            if (escape && i !== N) gain += (dx * escape.x + dy * escape.y) * M.escapePull * (flight ? (grind ? M.grindKiteMul : 1.8) : 1);

            // pull toward the middle of the arena — corners are death traps,
            // and a mob rush must bend the path INWARD, never into a corner
            const dcNow = Math.hypot(p.x - fw / 2, p.y - fh / 2);
            const dcNew = Math.hypot(nx - fw / 2, ny - fh / 2);
            gain += (dcNow - dcNew) * (0.06 + 0.07 * Math.min(1, th.near / 8));

            if (i !== N) gain += (dx * lastDir.x + dy * lastDir.y) * 1.4;  // momentum, prevents jitter
            else gain -= (zoner ? 2.4 : 1.0);                              // standing still is rarely right (and wastes burn zones)

            const value = gain - danger;
            if (!best || value > best.value) best = { dx, dy, value, danger, gain };
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
        const mag = Math.hypot(smoothVec.x, smoothVec.y);
        let vx, vy;
        if (mag > 0.02) { vx = smoothVec.x / mag; vy = smoothVec.y / mag; }
        else { vx = best.dx; vy = best.dy; }   // mid-reversal: commit to the new heading
        lastDir = { x: vx, y: vy };

        return {
            dx: vx, dy: vy,
            danger: best.danger, gain: best.gain, hpRatio, panic, hpPanic, slowMul,
            pauseActive, contactImminent, flight, grind, depth: +depth.toFixed(2),
            blastImminent: th.marks.some(m => typeof m.tLeft === 'number' && m.tLeft <= 0.45 &&
                Math.hypot(m.x - p.x, m.y - p.y) < m.r),
            surge: surgeActive, hellRecent, rainbowRecent, projImminent, laneUrgent, rivalUrgent, frozenUrgent, sprinterUrgent, stacking: !!stopBoss, flameAnchor, cornerAnchor: cornerOn, stackStation: stopStation, chase: !!th.rival, zoner, knocker, anchor, kiting: !!kite, flame: flameOn, hunger: +buildHunger.toFixed(2),
            toughness: +toughnessAvg.toFixed(2),
            passoutsNear: th.passouts.filter(po => Math.hypot(po.x - p.x, po.y - p.y) < 190).length,
            poCentroidDist: poN ? Math.round(Math.hypot(p.x - poCx, p.y - poCy)) : null,
            poNearest: poNearest == null ? null : Math.round(poNearest), ultFalloff: ultFall,
            ultInvuln, auraUlt, ultKind: charOf().ultKind || 'nuke',
            // nearest live (non-passout) body — how the ult gate decides
            // whether a spray/aura ult has anything to actually hit
            adjacent: th.enemies.reduce((m, e) => Math.min(m, Math.hypot(e.x - p.x, e.y - p.y) - (e.r || 0)), Infinity),
            poTtk: (poTtkOut == null || !isFinite(poTtkOut)) ? null : Math.round(poTtkOut),
            poDps: poDpsOut ? Math.round(poDpsOut) : 0, poGaveUp: poGiveUp.size,
            armorLv, armorConf: +armorConf.toFixed(2), holdoutAnchor,
            flameAim: flameTarget ? Math.round(flameTarget.d) : null,
            ultHarvest, ultInS: Math.round(ultInS), ultReadyNow,
            poField: th.passouts.length, poFree: th.passouts.reduce((n, po) => n + (po.contested ? 0 : 1), 0),
            kiteAt, fleeNear, contestTol: th.contestTol, trek: trekPo ? Math.round(Math.hypot(p.x - trekPo.x, p.y - trekPo.y)) : null,
            wallNear: th.enemies.some(e => e.wall && Math.hypot(e.x - p.x, e.y - p.y) < 190),
            bossNear: th.enemies.some(e => e.boss && !e.wall && Math.hypot(e.x - p.x, e.y - p.y) < 240),
            roamingBoss: th.enemies.some(e => e.boss && !e.wall && !e.stationary && Math.hypot(e.x - p.x, e.y - p.y) < 260),
            enemies: th.enemies.length, near: th.near, boss: th.boss,
            projectiles: th.projectiles.length, marks: th.marks.length,
            lines: th.lines.length, loot: loot.length,
            diag: `hp ${(hpRatio * 100).toFixed(0)}% | ${th.enemies.length}e ${th.projectiles.length}p ${th.marks.length}m ${loot.length}L | danger ${best.danger.toFixed(1)} | ${th.rival ? 'CHASE! ' : ''}${panic ? 'PANIC' : 'normal'}${depth > 0 ? ' | deep ' + Math.round(depth * 100) + '%' : ''}`
        };
    }


    function maybeAbilities(plan) {
        const now = Date.now();
        const A = CONFIG.abilities;
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
        if (A.dashEnabled && hasGame('tryDash') && now - lastDash > dashGate &&
            (plan.danger > dashThreshold || inBlastZone || plan.projImminent || plan.laneUrgent ||
                plan.rivalUrgent || plan.frozenUrgent || plan.sprinterUrgent || plan.contactImminent ||
                plan.flight || blastImminent)) {
            lastDash = now;
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
        let ultGate = (gtU < 1200 && !hellDetected) ? A.ultCooldownMs * 0.6 : A.ultCooldownMs;
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
        const invulnUlt = CH.ultKind === 'spray' || CH.ultKind === 'aura';
        const DH = CONFIG.deepHell;
        const ultChain = hellDetected && gtU > (DH.ultChainFromS || 9000);
        if (ultChain) ultGate = Math.min(ultGate, DH.ultChainGateMs || 300);
        if (A.ultEnabled && hasGame('useUltimate') && now - lastUlt > ultGate &&
            (plan.near >= A.ultCrowd || plan.hpRatio < A.ultHpRatio ||
                defensive || offensive || emergency || entryHold || surgeCrowd || harvest || lootTargets || linebackerBurst || scalingMobs || ultSpam || contactSave || survivalUlt ||
                ultChain)) {   // v6.88.2: deep + invuln ult = fire, unconditionally
            lastUlt = now;
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

            if (now - lastOverlay >= CONFIG.overlayMs) {
                lastOverlay = now;
                handleScreens();
                if (!running) return;   // a handler may have stopped us (hell record)
            }

            if (now - lastTick >= CONFIG.tickMs) {
                lastTick = now;
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
        lastTick = 0; lastOverlay = 0;
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
    // =================================================================
    let statusEl = null, infoEl = null;
    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

    function buildPanel() {
        if (!document.body || document.getElementById('pineBotPanel')) return;
        const el = document.createElement('div');
        el.id = 'pineBotPanel';
        // right-MIDDLE + translucent (user: the top-right spot covered the
        // cocktail/ingredient display). Solidifies on hover for readability.
        el.style.cssText = [
            'position:fixed', 'right:10px', 'top:50%', 'transform:translateY(-50%)', 'z-index:2147483647',
            'background:rgba(16,16,22,.55)', 'color:#eee', 'font:11px/1.45 ui-monospace,Menlo,monospace',
            'padding:9px 10px', 'border-radius:9px', 'min-width:215px', 'opacity:.75',
            'transition:opacity .15s,background .15s',
            'border:1px solid rgba(58,58,70,.6)', 'box-shadow:0 4px 18px rgba(0,0,0,.35)', 'user-select:none'
        ].join(';');
        el.onmouseenter = () => { el.style.opacity = '1'; el.style.background = 'rgba(16,16,22,.95)'; };
        el.onmouseleave = () => { el.style.opacity = '.75'; el.style.background = 'rgba(16,16,22,.55)'; };
        el.innerHTML =
            '<div style="font-weight:700;margin-bottom:5px;color:#ffd98a">🍸 Pine Bot v' + scriptTag() + '</div>' +
            '<div style="margin-bottom:6px">' +
            '<button id="pbStart" style="cursor:pointer">▶ Start</button> ' +
            '<button id="pbStop" style="cursor:pointer">■ Stop</button> ' +
            '<button id="pbDiag" style="cursor:pointer" title="Diagnostics">🔍</button> ' +
            '<button id="pbStats" style="cursor:pointer" title="Stats report — copy &amp; paste to Claude">📊</button> ' +
            '<button id="pbSnap" style="cursor:pointer" title="Version comparison — freeze a snapshot of this version and show every version side by side">📸</button> ' +
            '<button id="pbReset" style="cursor:pointer" title="Reset learning (version snapshots are kept)">↺</button> ' +
            '<button id="pbRec" style="cursor:pointer" title="Record YOUR manual play as a teaching demo — press once to start, again to stop; the digest opens ready to copy for Claude">🎥</button>' +
            '</div>' +
            '<div>status: <span id="pbStatus" style="color:#8fd">idle</span></div>' +
            '<div id="pbInfo" style="margin-top:5px;color:#aab"></div>';
        document.body.appendChild(el);
        statusEl = el.querySelector('#pbStatus');
        infoEl = el.querySelector('#pbInfo');
        el.querySelector('#pbStart').onclick = startBot;
        el.querySelector('#pbStop').onclick = () => stopBot();
        el.querySelector('#pbDiag').onclick = () => diagnose();
        el.querySelector('#pbStats').onclick = () => showReport(buildStatsReport());
        el.querySelector('#pbSnap').onclick = () => { snapshotNow('manual'); showReport(versionComparison()); };
        el.querySelector('#pbReset').onclick = resetLearn;
        el.querySelector('#pbRec').onclick = demoToggle;
        setInterval(demoTick, 160);

        setInterval(() => {
            if (!infoEl) return;
            const st = G.state;
            const p = lastPlan;
            const hidden = document.hidden === true;
            const vs = (learn.versions || {})[scriptTag()];
            // v6.88.0 AUDIT S1. This was innerHTML. `lastAction` is built in
            // clickEl from the clicked element's textContent — and the bot's
            // stuck-breaker clicks by TEXT across div/span/li, so a leaderboard
            // row carrying another player's display name can reach this line.
            // Concatenated into innerHTML on a 400 ms timer, a crafted name
            // executes in the game's origin. The static chrome is still markup;
            // every value that comes from the page goes in as a text node.
            const rows = [
                'tab: ' + TAB_ID + '   runs(all tabs): ' + learn.runs +
                    (vs && vs.n ? '   this ver: ' + vs.n + ' runs, best ' + Math.round(vs.bestT / 60) + 'm' : ''),
                hidden ? '\u26a0 background tab — game frozen by the browser; keep this window visible' : null,
                'state: ' + (st == null ? '(unreadable)' : st),
                'move: ' + moveSource,
                'build: ' + (primaryCocktail || '\u2014'),
                'picks: ' + runPicks.length,
                'model: CEM g' + learn.cem.gen + ' (' + learn.cem.batch.length + '/' + CONFIG.learning.batchSize + ')' +
                    (championRun ? ' \ud83d\udc51' : '') +
                    (lastDeathCause ? '   died\u2192' + lastDeathCause : '') +
                    (learn.hof.length && isFinite(learn.hof[0].r) ? '   best ' + learn.hof[0].r.toFixed(2) : '') +
                    (learn.genHistory.length >= 2
                        ? (learn.genHistory[learn.genHistory.length - 1] > learn.genHistory[learn.genHistory.length - 2] ? ' \u2191' : ' \u2193')
                        : ''),
                p ? p.diag : null,
                'last: ' + String(lastAction).slice(0, 34)
            ];
            infoEl.textContent = '';
            for (const r of rows) {
                if (r == null) continue;
                const line = document.createElement('div');
                line.textContent = r;
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

    function showReport(report) {
        const old = document.getElementById('pineBotReport');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'pineBotReport';
        el.style.cssText = 'position:fixed;left:10px;top:10px;right:250px;max-height:70vh;overflow:auto;z-index:2147483647;' +
            'background:rgba(10,10,14,.96);color:#cfe;font:10px/1.4 ui-monospace,monospace;padding:10px;border-radius:8px;border:1px solid #3a3a46';
        const close = document.createElement('button');
        close.textContent = 'close';
        close.style.cssText = 'float:right;cursor:pointer';
        close.onclick = () => el.remove();
        const copy = document.createElement('button');
        copy.textContent = 'copy';
        copy.style.cssText = 'float:right;cursor:pointer;margin-right:6px';
        copy.onclick = () => { try { navigator.clipboard.writeText(JSON.stringify(report, null, 2)); copy.textContent = 'copied'; } catch (e) { } };
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(report, null, 2);
        el.appendChild(close);
        el.appendChild(copy);
        el.appendChild(pre);
        document.body.appendChild(el);
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
            localStorage.setItem('pineBotDemos', JSON.stringify(all));
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
            }
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
            const dd = Math.hypot(e.x - p.x, e.y - p.y);
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
        const cnr = Math.round(Math.hypot(Math.min(p.x, fW - p.x), Math.min(p.y, fH - p.y)));
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
            ol: (p.weapons || {}).olive || 0, ng: (p.weapons || {}).negroni || 0
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
                config: CONFIG, learn: () => learn, plan: () => lastPlan, state: () => G.state,
                version: SCRIPT_VERSION, tag: scriptTag(),
                // VERSION SNAPSHOTS
                compare: versionComparison,            // every version side by side, with deltas
                versions: versionReport,               // same table, best-time first (back-compat)
                restartSearch: () => restartSearch('manual'),   // v6.86.0: reopen the search by hand
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
                    evolutionPending, takeCraftPrompt, stateHandlers: STATE_HANDLERS, handleScreens,
                    // v6.88.0 AUDIT: hooks for the regression suite
                    versionRows, applyParams, saveLearn, pruneVersions,
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
                    hitTypes: () => Object.assign({}, hitTypeRun),
                    bossHitSamples: () => bossHitD.slice(),
                    applyDefaults: () => applyParams(DEFAULT_PARAMS),
                    sigmasAtFloor, paramDist, hofRecord,
                    charProfile: charOf,
                    setChar: b => { if (CHARS[b]) activeChar = b; },
                    // v6.86.11: the pat/minguk rotation is testable — the pin
                    // was lifted, and a rotation that silently stops rotating
                    // is exactly the 6.85.0 bug that cost a hundred runs.
                    activeChar: () => activeChar,
                    nextRotationChar, chooseBartender,
                    resetUltGate: () => { lastUlt = 0; }, resetPoTracking,
                    reloadLearn: () => { learn = loadLearn(); }
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

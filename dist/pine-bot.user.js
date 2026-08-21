// ==UserScript==
// @name         Pine & Co Auto Survivor
// @namespace    https://pineandco.online/
// @version      6.85.11
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
    const SCRIPT_VERSION = '6.85.11';
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
        // v6.85.3 (user directive): PIN PAT. No rotation.
        // 6.85.2 had pat/minguk alternating so minguk acted as a live control.
        // That is now dropped in favour of sample rate: every run lands on the
        // freshly recalibrated tank, so his median/day-clear/mark-share move
        // twice as fast against the 6.85.1 baseline (925s / 0.31 / 37%).
        // The cost is real and worth remembering — minguk is currently the
        // BETTER character (median 21.9m vs Pat's 15.4m), so while this is
        // pinned every run is on the weaker profile and crown odds are lower.
        // minguk still has ~600 runs of history to compare against, so the
        // control is historical rather than concurrent.
        // To restore the A/B: set preferredBartender back to null. The
        // rotation list below is inert while a bartender is pinned.
        preferredBartender: 'pat',
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
            cocktails: ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE', 'COSMOPOLITAN'],
            ingredients: ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CAMPARI', 'CRANBERRY', 'SUGAR']
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

        // HELL UNBAN (v6.83.0): ingredients that leave the avoid list and
        // join the plan the moment a run is in hell. GINGER BEER = MOSCOW
        // MULE's super key (knockback whip) = the fifth super line.
        hellUnbanIngredients: ['GINGER BEER'],

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
            kitePull: 2.0,        // tangential sweep around the swarm (conga-line kiting)
            escapePull: 4.0,      // drive through the widest gap when surrounded
            hellCautionMul: 1.3,  // everything hits harder in hell — extra movement caution there
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
            markWeightMul: 1.4     // v6.84.0: and how hard those blasts are weighted
        },

        abilities: {
            dashEnabled: true,
            dashCooldownMs: 1300,   // DEMO-TUNED: the user dashes sparingly (~0.6/min)
            dashDangerScore: 4.0,  // DEMO-TUNED: dashes are for emergencies, not locomotion
            ultEnabled: true,
            ultCooldownMs: 2500,   // retry cadence only — the game's real cooldown governs
            ultCrowd: 9,           // enemies inside nearbyRadius
            ultHpRatio: 0.4
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
            anneal: 0.98,          // per-generation exploration shrink: each iteration refines, not re-guesses
            deathNudge: 0.03,      // per-generation defensive push against the dominant killer
            // roster bandit (rosterExperiment): explore/exploit over WHOLE
            // cocktail rosters, on the run-reward scale (~0.2 - 2.5)
            rosterExplore: 0.25,       // UCB width — how eagerly untried rosters get auditions
            rosterIncumbentEdge: 0.05,  // the user's prescribed build starts ahead by this much
            // VERSION SNAPSHOTS: how many frozen per-version records to keep,
            // and how many best runs each version remembers.
            snapshotKeep: 24,
            versionTopRuns: 5,
            versionTimesKeep: 600      // per-version survival-time list (median / SD); oldest dropped past this
        },

        // Strategy weights. These are CEM-TUNABLE (see TUNABLE below), so the
        // strategy itself — not just the dodge physics — improves across runs.
        strategy: {
            deepFocusLv: 5,        // no new cocktail while an owned one is below this level
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
        milestones: { superUnlock: 0.06, craft: 0.05, dayCleared: 0.25, hellEntered: 0.15, rainbow: 0.5, hellDepth: 0.25, crownProgress: 2.0 },

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

        canvasSelector: 'canvas'
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
        pat:    { hp: 180, speed: 1.9,   style: 'tank',   kiteMul: 1.0, anchorBias: 1, panicMul: 0.85, mitigationTilt: 10,
                  dayRing: { early: 165, mid: 90, late: 80 }, crowdPanic: false, bossFloor: 0, ultFalloff: true },
        joe:    { hp: 100, speed: 3.0,   style: 'runner', kiteMul: 1.1, anchorBias: 0, panicMul: 1.1,  mitigationTilt: 4,
                  dayRing: null, crowdPanic: true, bossFloor: 0, ultFalloff: false },
        minguk: { hp: 120, speed: 2.375, style: 'runner', kiteMul: 1.0, anchorBias: 0, panicMul: 1.0,  mitigationTilt: 0,
                  dayRing: null, crowdPanic: true, bossFloor: 0, ultFalloff: false }
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

    const COCKTAILS = [
        'GIMLET', 'MANHATTAN', 'OLD FASHIONED', 'SIDECAR', 'MOJITO', 'COSMOPOLITAN',
        'GIN TONIC', 'WHISKEY HIGHBALL', 'VODKA TONIC', 'VODKA CRANBERRY', 'SOUTH SIDE',
        'MARGARITA', 'DRY MARTINI', 'VODKA MARTINI', 'MOSCOW MULE', 'WHISKY SOUR',
        'NEGRONI', 'BLOODY MARY', 'ESPRESSO MARTINI', 'CORPSE REVIVER No.2'
    ];

    // Cocktail -> the ingredient that must be MAXED to unlock its super form.
    const SUPER_KEY_INGREDIENT = {
        'GIMLET': 'LIME', 'MANHATTAN': 'SWEET VERMOUTH', 'OLD FASHIONED': 'ANGOSTURA',
        'SIDECAR': 'COINTREAU', 'MOJITO': 'SUGAR', 'COSMOPOLITAN': 'ORANGE',
        'GIN TONIC': 'TONIC', 'WHISKEY HIGHBALL': 'WATER', 'VODKA TONIC': 'TONIC',
        'VODKA CRANBERRY': 'CRANBERRY', 'SOUTH SIDE': 'MINT', 'MARGARITA': 'ORANGE',
        'DRY MARTINI': 'OLIVE', 'VODKA MARTINI': 'DRY VERMOUTH', 'MOSCOW MULE': 'GINGER BEER',
        'WHISKY SOUR': 'LEMON', 'NEGRONI': 'CAMPARI', 'BLOODY MARY': 'TOMATO JUICE',
        'ESPRESSO MARTINI': 'COFFEE BEANS', 'CORPSE REVIVER No.2': 'ABSINTHE'
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
        'CORPSE REVIVER No.2': 26, 'WHISKY SOUR': 25, 'ESPRESSO MARTINI': 18,
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
    let PLAN_COCKTAILS = ['SOUTH SIDE', 'VODKA TONIC', 'GIN TONIC', 'NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE', 'COSMOPOLITAN'];
    let PLAN_INGREDIENTS = ['MINT', 'TONIC', 'OLIVE', 'SWEET VERMOUTH', 'DRY VERMOUTH', 'TOMATO JUICE', 'CAMPARI', 'CRANBERRY', 'SUGAR'];

    // USER AVOID LIST: never pick these UNLESS the pool offers nothing else
    // from the priority roadmap ("ignore ... unless no other ingredients in
    // the priority roadmap appear"). Enforced in scoreCard per-pool, and these
    // cocktails are excluded from experiment rosters and self-composition.
    const AVOID_COCKTAILS = new Set([
        'GIMLET', 'MANHATTAN', 'OLD FASHIONED', 'SIDECAR', 'WHISKEY HIGHBALL',
        'MARGARITA', 'ESPRESSO MARTINI', 'CORPSE REVIVER No.2',
        // MINGUK guard: these two would complete a SIXTH super off in-plan
        // keys (SUGAR, OLIVE) and summon the gun — banned by design
        'MOJITO', 'DRY MARTINI'
    ]);
    // WATER is NOT banned (user): WATER + SUGAR craft into SIMPLE SYRUP,
    // which opens the ingredient pool toward TOMATO JUICE (ult cooldown).
    const AVOID_INGREDIENTS_BASE = ['LIME', 'COINTREAU', 'SODA WATER', 'ABSINTHE', 'LEMON', 'ORANGE', 'ANGOSTURA', 'GINGER BEER', 'COFFEE BEANS'];   // LEMON stays banned (blocks SUPER WHISKY SOUR = the 6th super); TONIC is now the shared key
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
        'CORPSE REVIVER No.2': ['summon', 'defense'],       // tanky self-healing zombie allies
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
        'strategy.deepFocusLv': { min: 2, max: 6 },
        'strategy.roadmapBonus': { min: 10, max: 24 },   // floored: the prescribed roster stays dominant
        'strategy.earlyDps': { min: 4, max: 24 },
        'strategy.expandPenalty': { min: 8, max: 30 },
        'strategy.dpsDeficitGain': { min: 10, max: 40 },
        'strategy.rainbowReadyS': { min: 1450, max: 1800 },   // hard 25-30 min band (user) — no late drift
        'movement.kitePull': { min: 0.5, max: 4.0 },
        'movement.escapePull': { min: 1.5, max: 6.0 },
        'movement.hellCautionMul': { min: 0.8, max: 2.2 },
        'movement.passoutValue': { min: 18, max: 54 },   // floored+widened: every passout must die before the finale (user)
        'movement.wallSiegeValue': { min: 12, max: 42 },
        'movement.bossEngageValue': { min: 10, max: 36 }
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
        // isFinite guard: NaN is typeof 'number' and would poison every score
        for (const k of Object.keys(TUNABLE)) if (isFinite(p[k])) setParam(k, p[k]);
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
    let trialParams = null;                                         // CEM sample being trialed this run
    let championRun = false;                                        // this run replays the all-time-best params
    let pendingHellEntry = false;                                   // we clicked the hell entrance — next run is hell
    let dangerAccum = { contact: 0, proj: 0, mark: 0, line: 0, rival: 0 };    // death-cause telemetry
    let lastHpSample = null;   // for damage-weighted death attribution
    const slowPadRef = { v: 1 };   // live slow-scaled safety multiplier (set each plan tick)
    const th_nearRef = { v: 0 };   // live crowd pressure, for pick-time context
    const flightRef = { v: false };  // live flight-mode flag (unkillable chase)
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

    let runActive = false;
    let runStart = 0;
    let runPicks = [];
    let runPickCounts = {};
    let primaryCocktail = null;         // the build we commit to
    let ownedLevels = {};               // NAME -> level, learned from level-up cards
    let ownedMax = {};                  // NAME -> maxlv
    let lastPoolSig = null;
    let lastPickAt = 0;
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
        try {
            // shared: versions + snapshots (+ lastVersion for the freeze check)
            localStorage.setItem(SHARED_KEY, JSON.stringify({ versions: learn.versions || {}, snapshots: learn.snapshots || [], lastVersion: learn.lastVersion }));
            // per-bartender: everything else
            const { versions, snapshots, ...own } = learn;
            localStorage.setItem(learnKey(), JSON.stringify(own));
        } catch (e) { }
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
        const out = Object.values(rows).sort(cmp);
        let prev = null;
        for (const r of out) {
            if (prev && isFinite(r.meanTimeS) && isFinite(prev.meanTimeS)) {
                // z-score of the mean-time gap (Welch). |z| < 2 = still noise.
                let z = null;
                if (isFinite(r.seTimeS) && isFinite(prev.seTimeS) && (r.seTimeS || prev.seTimeS))
                    z = +((r.meanTimeS - prev.meanTimeS) / Math.sqrt(r.seTimeS * r.seTimeS + prev.seTimeS * prev.seTimeS)).toFixed(2);
                r.vsPrev = {
                    version: prev.version,
                    meanTimeS: r.meanTimeS - prev.meanTimeS,
                    medianTimeS: (isFinite(r.medianTimeS) && isFinite(prev.medianTimeS)) ? r.medianTimeS - prev.medianTimeS : null,
                    bestTimeS: (isFinite(r.bestTimeS) && isFinite(prev.bestTimeS)) ? r.bestTimeS - prev.bestTimeS : null,
                    hellRate: (isFinite(r.hellRate) && isFinite(prev.hellRate)) ? +(r.hellRate - prev.hellRate).toFixed(2) : null,
                    p60: (isFinite(r.p60) && isFinite(prev.p60)) ? +(r.p60 - prev.p60).toFixed(2) : null,
                    z, verdict: z == null ? 'insufficient data' : (Math.abs(z) < 2 ? 'noise (|z|<2)' : (z > 0 ? 'better (z>=2)' : 'worse (z<=-2)'))
                };
            }
            if (isFinite(r.meanTimeS)) prev = r;
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
    function endTrial(reward) {
        if (!trialParams) return;
        const c = learn.cem;
        c.batch.push({ r: +reward.toFixed(4), p: trialParams, d: lastDeathCause });
        // Hall of fame: keep the top-5 runs EVER. Every refit anchors toward
        // them, so no generation can drift away from proven winners.
        learn.hof.push({ r: +reward.toFixed(4), p: trialParams });
        learn.hof.sort((a, b) => b.r - a.r);
        learn.hof = learn.hof.slice(0, 5);
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
        const rMean = all.reduce((a, e) => a + e.r, 0) / all.length;
        const gradMoves = [];
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            let cov = 0, varP = 0, varR = 0;
            for (const e of all) {
                const pv = e.p && isFinite(e.p[k]) ? e.p[k] : null;
                if (pv == null) continue;
                const dp = pv - c.mean[k], dr = e.r - rMean;
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
            PLAN_COCKTAILS = CONFIG.userRoadmap.cocktails.slice();
            PLAN_INGREDIENTS = CONFIG.userRoadmap.ingredients.slice();
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

    function scoreCard(card, index, poolArr) {
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
                const gtNow = typeof G.gameTime === 'number' ? G.gameTime : 0;
                if (gtNow >= CONFIG.strategy.rainbowReadyS) {
                    if (!rainbowChoice) rainbowChoice = chooseRainbowPolicy();
                    if (rainbowChoice === 'take') add(400, 'RAINBOW');
                    else add(18, 'no-rainbow-path');   // exploring the pure-supers crown route
                } else add(18, 'rainbow-too-early');
                break;
            }
            case 'rbstat': add(220, 'rainbow-stat'); break;
            case 'evolve': add(300, 'evolve'); break;
            case 'super': add(260, 'super'); break;
            case 'ult':
                // USER DIRECTIVE: the ULTIMATE is the highest-priority pick —
                // it single-handedly clears passout fields, and maxed by ~20
                // min it deletes the boss ladder. Only the gun outranks it.
                add(320, 'ultimate');
                if (CONFIG.userRoadmap) add(20, 'user-build');
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
                // MINGUK DOCTRINE: time-pause extensions are the endgame
                // engine — every extra second is another window to melt a
                // paused boss with SOUTH SIDE. Maximize the count of these.
                const gtT = typeof G.gameTime === 'number' ? G.gameTime : 0;
                add(130 + (hellDetected ? 45 : (gtT > 1000 ? 25 : 0)), 'timestop');
                break;
            }
            case 'sp_tequila': add(65, 'tequila'); break;
            case 'gold': add(14, 'gold'); break;
            case 'gen': add(30, 'generator'); break;
            default: break;
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
            if (name === 'ABSINTHE' && !(ownedLevels['CORPSE REVIVER No.2'] > 0)) add(-6, 'absinthe-trap');
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

        // ABSOLUTE PRIORITY (user): SOUTH SIDE and MINT lead everything below
        // the ultimate and SHAKING UP — the burn engine and its super key.
        // USER: SOUTH SIDE is THE weapon — nothing but the ultimate and the
        // base attack outranks it (MINT rides with it as its super key).
        if (!atCap && /SOUTH\s*SIDE/i.test(name)) add(40, 'absolute-priority');
        if (!atCap && name === 'MINT') {
            add(24, 'absolute-priority');
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
            const nSupers = Math.max(supersMade.size, liveSuperCount());
            // the sixth super IS the gun — refuse the unlock card...
            if (type === 'super' && nSupers >= 5) add(-500, 'gun-guard');
            // ...and refuse anything that would OPEN a sixth line in the
            // first place (user: block it when picking weapons/ingredients).
            if (nSupers >= 5 && (type === 'weapon' || type === 'passive') &&
                opensNewSuperLine(type, name)) add(-500, 'gun-guard-source');
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
        if (sig === lastPoolSig && now - lastPickAt < 900) return false; // already acted on this pool
        learnFromPool(pool);
        if (hellDetected) applyHellUnban();

        const scored = pool.map(scoreCard).sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (!best) return false;

        // GINGER BEER grants level-up RE-ROLLS (recipe book): if the whole
        // pool is weak, spend one instead of eating a dead pick. Once per pool.
        if (best.score < 22 && sig !== lastRerollSig) {
            const rr = findByText(/re-?roll/i);
            if (rr) {
                lastRerollSig = sig;
                clickEl(rr);
                setStatus('weak pool — re-rolled');
                return true;
            }
        }

        lastPoolSig = sig;
        lastPickAt = now;

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

        pickAudit.push({
            gt: Math.round((typeof G.gameTime === 'number' ? G.gameTime : 0)),
            took: best.name, score: Math.round(best.score), why: best.why.trim(),
            over: scored.slice(1, 3).map(o => o.name + '=' + Math.round(o.score))
        });
        if (pickAudit.length > 14) pickAudit.shift();
        log('level-up:', scored.map(s => `${s.name}(${s.type})=${s.score.toFixed(0)}`).join('   '));
        setStatus('picked ' + best.name);

        lastLevelUpAt = Date.now();
        if (hasGame('pickUpgrade')) { callGame('pickUpgrade', best.index); return true; }
        return clickCardByIndex(best.index) || clickCardByName(best.name);
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
        runStart = Date.now();
        runPicks = [];
        runPickCounts = {};
        primaryCocktail = null;
        ownedLevels = {};
        ownedMax = {};
        lastPoolSig = null;
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
        if (clickText(/enter\s*hell|go\s*to\s*hell|🔥\s*hell/i) ||
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
        playing() { return false; },   // the movement loop owns this state
        levelup() {
            return handleLevelUp() || clickCardByIndex(0);
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
            return clickText(/make it|craft|confirm|yes/i);
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
                !!callFirst(['backToTitle']) || clickText(/title|back|ok/i);
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
            const generic = /start|play|skip|continue|next|ok|confirm|got it|cheers|yes|retry|again|make it|enter|go|resume|close|after\s*hours/i;
            if (!clickText(generic)) {
                const els = cardElements();
                if (els.length) clickEl(els[Math.min(stuckTries - 1, els.length - 1)]);
                else {
                    // never blind-click SAVE — the logbook must stay untouched
                    const any = [...document.querySelectorAll('button, [role="button"], .btn')]
                        .filter(el => visible(el) && !/save/i.test(el.textContent || ''));
                    if (any.length) clickEl(any[Math.min(stuckTries - 1, any.length - 1)]);
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
                const d = Math.hypot(e.x - p.x, e.y - p.y);
                if (d > R) continue;
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
                const frozen = typeof e.frozenUntil === 'number' && fr != null && e.frozenUntil > fr;
                const frozenLeft = frozen ? (e.frozenUntil - fr) : 0;
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
                const freezeAura = t === 'boss' && !!e.partner;
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
                    reach: (prof.radius + (chaserFast && t === 'boss' ? 50 : 0) + (freezeAura ? 130 : 0)) * (slowPadRef.v || 1),   // fast bosses + freeze auras: fear from further out, scaled by how slowed we are
                    w: prof.weight * armorEase,
                    wall: isWall, boss: t === 'boss', stationary: isStationary, chaserFast, freezeAura,
                    frozen, frozenLeft
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
                if (t === 'boss') { out.boss = true; out.mix.boss++; }
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
            const owners = new Set((G.roadLines || []).map(l => l && l.owner).filter(o => o != null));
            if (owners.size) for (const e of out.enemies) {
                if (e.boss && !e.wall) e.linebacker = true;   // lanes up: treat lane-capable bosses as chargers
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
            } else if (kind === 'coin' || kind === 'bill') {
                // Gold buys weapon upgrades — when we're losing the damage
                // race, gold IS damage. Scale it up with the deficit.
                v += Math.round(8 * dpsDeficit);
            }
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

        const maxHp = p.maxHp || p.maxHealth || p.hpMax || 100;
        const hp = p.hp != null ? p.hp : (p.health != null ? p.health : maxHp);
        const hpRatio = Math.max(0, Math.min(1, hp / (maxHp || 1)));

        // FLAME CROSS ACTIVE (user: stand more ground): while the cross burns,
        // everything near the bot dies — fear drops, farming intensifies, the
        // standoff tightens so the burn zone stays ON the crowd.
        const frameNow = safe(() => frame, 0) || 0;
        const flameOn = typeof p.fireCrossUntil === 'number' && p.fireCrossUntil > frameNow;

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

        // GUARDED LOOT: an item whose straight path crosses a passout's body
        // would drag the bot into contact damage (source-verified: passouts
        // hurt on touch). Mute its pull — the ring farm kills the passout and
        // frees the loot in a moment. VITAL heals keep full pull: one contact
        // tick is a fair price when the alternative is dying.
        for (const it of loot) {
            if (it.vital) continue;
            for (const po of th.passouts) {
                if (distPointSeg(po.x, po.y, p.x, p.y, it.x, it.y) < po.r + 18) { it.v *= 0.15; break; }
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
        const caution = (1 + 0.4 * late + 0.3 * Math.min(1, Math.max(0, toughnessAvg - 1))) *
            (hellDetected ? M.hellCautionMul : 1) *
            (hellRecent ? 1.35 : 1) *
            (rainbowRecent ? 1.35 : 1) *
            (surgeActive ? 1.25 : 1) *
            (flameOn ? 0.72 : 1);   // the burn IS the shield: hold the fray

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
        }
        lastHpSample = hp;

        // LATE-DAY FIX (user: passouts not cleared 15-20 min): 'panic' used
        // to trigger on CROWD COUNT alone, which is just the normal state of
        // a dense late-day field — it was turning all farming off exactly
        // when the loot matters most. hpPanic = actually hurt; panic (crowd
        // included) still governs movement caution and loot greed.
        // v6.85.0: a tank panics later (more HP to spend), a runner sooner
        const hpPanic = hpRatio < M.panicHp * charOf().panicMul * (1 + 0.25 * late);
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
        if (chasers >= ((zoner || rainbowRecent) ? 2 : 3) && !panic) {
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
        const unkillable = toughnessAvg > 25 || (killRate < 0.8 && th.near >= 6);
        const flight = hellDetected && !pauseActive && unkillable && th.near >= 4;
        flightRef.v = flight;

        // v6.85.2: falling-passout drops excluded — see the `drop` tag above.
        const markHere = th.marks.some(m => !m.drop && Math.hypot(m.x - p.x, m.y - p.y) < m.r + 50);
        // live enemy fire anywhere near us: do NOT plant — keep moving
        const projHere = th.projectiles.some(q =>
            Math.hypot(q.x - p.x, q.y - p.y) < q.r + 130);
        const dayPhaseNow = !hellDetected && (typeof G.gameTime === 'number' ? G.gameTime : 0) < 1200;
        // v6.85.0: a tank plants on a busier field than a runner would
        const anchor = !hpPanic && hpRatio > 0.7 && !markHere && !projHere && !th.rival && !rainbowRecent && !flight &&
            (!dayPhaseNow || th.near <= 2 + charOf().anchorBias * 2) &&   // day: only anchor on a quiet field (manual run: crowd median 0)
            ((ownedLevels['OLIVE'] || 0) >= 2 || (ownedLevels['NEGRONI'] || 0) >= 2) &&
            (wallFocus || th.passouts.some(po => !po.contested && Math.hypot(po.x - p.x, po.y - p.y) < 220));
        // USER-VERIFIED: Corpse Reviver zombies can hit NEITHER passouts NOR
        // no-booking walls — a CR-only build farms both at base-attack speed,
        // so the detour incentive is cut for each. (Hoisted out of the
        // candidate loop — audit fix: was recomputed 33x per tick, twice.)
        const crOnly = (ownedLevels['CORPSE REVIVER No.2'] || 0) > 0 && ownedCocktailCount() === 1;
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
        const stopStation = stopBoss
            ? ((stopBoss.left || 0) > 120 ? (stopBoss.r || 40) + 40 : Math.max(150, (stopBoss.r || 40) + 90))
            : null;

        let best = null;
        const N = M.samples;
        for (let i = 0; i <= N; i++) {
            let dx, dy;
            if (i === N) { dx = 0; dy = 0; }              // the "stand still" candidate
            else { const a = (i / N) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }

            const nx = Math.max(0, Math.min(fw, p.x + dx * step));
            const ny = Math.max(0, Math.min(fh, p.y + dy * step));

            let danger = 0;

            for (const e of th.enemies) {
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
                let frailHp = Infinity, firstId = Infinity;
                for (const po of th.passouts) {
                    if (po.contested || po.far) continue;
                    if (po.maxHp < frailHp) frailHp = po.maxHp;
                    if (po.id < firstId) firstId = po.id;
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
                    const dayRing = dr
                        ? (gtRing < 180 ? dr.early : (gtRing < 600 ? dr.mid : dr.late))
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
                    if (flameOn) ring = Math.min(ring, zone + 24);
                    const dNow = Math.hypot(p.x - po.x, p.y - po.y);
                    const d1 = Math.hypot(nx - po.x, ny - po.y);
                    if (dNow < zone) {
                        // TOUCHING it (taking contact ticks): retreat gradient
                        // only — no farm attraction until we're off the body
                        danger += 55 * (1 - Math.min(1, d1 / (zone + 30)));
                    } else {
                        gain += M.passoutValue * (crOnly ? 0.4 : 1) *
                            (Math.abs(dNow - ring) - Math.abs(d1 - ring)) * 0.15;
                        // never enter the contact zone, never cut through the
                        // body to reach the far side of the firing ring
                        if (d1 < zone || distPointSeg(po.x, po.y, p.x, p.y, nx, ny) < zone) danger += 60;
                    }
                }
            }

            // standoff: hold a productive distance from the crowd so weapons
            // keep firing (widened automatically when the wave is swarm-heavy)
            if (th.enemies.length && !panic) {
                const errNow = Math.abs(Math.hypot(p.x - cx, p.y - cy) - standoffAdj);
                const errNew = Math.abs(Math.hypot(nx - cx, ny - cy) - standoffAdj);
                gain += M.standoffPull * (errNow - errNew) * 0.28 * (anchor ? 0.4 : 1);   // anchored: the ring wins
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
                gain += 44 * (eNowS - eNewS) * 0.2;
            }

            // ult centering: with 2+ passouts, drift onto their centroid so
            // the outward spiral catches the whole group
            // v6.85.8: under falloff, ONE passout is worth closing on, and the
            // `anchor` gate (HP > 0.7 plus OLIVE/NEGRONI >= 2) kept the bot off
            // the cluster for the whole early day — exactly the window where
            // the user wants passout loot funding the ult. The gate is now the
            // safety half of `anchor` only: hurt, or a blast/shot overlapping
            // the stand position, still suspends it.
            const ultAimOk = ultFall ? (poN >= 1 && !hpPanic && !markHere && !projHere) : (anchor && poN >= 2);
            if (ultAimOk) {
                const eNow = Math.hypot(p.x - poCx, p.y - poCy);
                const eNew = Math.hypot(nx - poCx, ny - poCy);
                gain += (ultFall ? 22 : 14) * (eNow - eNew) * 0.15;
            }

            // kiting sweep + gap escape
            if (kite && i !== N) gain += (dx * kite.x + dy * kite.y) * M.kitePull * charOf().kiteMul * (zoner ? 1.6 : 1) * (knocker && th.boss ? 1.25 : 1) * (rainbowRecent ? 1.4 : 1) * (anchor ? 0.35 : 1) * (flight ? 1.8 : 1);
            if (escape && i !== N) gain += (dx * escape.x + dy * escape.y) * M.escapePull * (flight ? 1.8 : 1);

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
            pauseActive, contactImminent, flight, depth: +depth.toFixed(2),
            blastImminent: th.marks.some(m => typeof m.tLeft === 'number' && m.tLeft <= 0.45 &&
                Math.hypot(m.x - p.x, m.y - p.y) < m.r),
            surge: surgeActive, hellRecent, rainbowRecent, projImminent, laneUrgent, rivalUrgent, frozenUrgent, sprinterUrgent, stacking: !!stopBoss, stackStation: stopStation, chase: !!th.rival, zoner, knocker, anchor, kiting: !!kite, flame: flameOn, hunger: +buildHunger.toFixed(2),
            toughness: +toughnessAvg.toFixed(2),
            passoutsNear: th.passouts.filter(po => Math.hypot(po.x - p.x, po.y - p.y) < 190).length,
            poCentroidDist: poN ? Math.round(Math.hypot(p.x - poCx, p.y - poCy)) : null,
            poNearest: poNearest == null ? null : Math.round(poNearest), ultFalloff: ultFall,
            poField: th.passouts.length, poFree: th.passouts.reduce((n, po) => n + (po.contested ? 0 : 1), 0),
            contestTol: th.contestTol, trek: trekPo ? Math.round(Math.hypot(p.x - trekPo.x, p.y - trekPo.y)) : null,
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
        const harvest = !plan.hpPanic && ((plan.passoutsNear || 0) >= 3 ||
            ((plan.passoutsNear || 0) >= 1 && (plan.poCentroidDist == null || plan.poCentroidDist < 80)));
        // v6.85.8 (user: "the bot should be using the ultimate more frequently
        // to kill passouts"). Adding another TRIGGER would have done nothing —
        // `lootTargets` already fires on any passout within 190px, so every
        // trigger-shaped version of this was measured redundant. What actually
        // limits the rate is the RETRY GATE: the bot asks the game for the ult
        // every ultCooldownMs, so a passout can sit in range for over a second
        // after the game's own cooldown ends. With a passout in falloff range
        // the retry drops to 900 ms so the ult goes off as soon as the game
        // allows it. callGame is a no-op while the real cooldown runs.
        const poClose = plan.ultFalloff === true && !plan.hpPanic &&
            plan.poNearest != null && plan.poNearest < 120;
        // USER DOCTRINE: an available ultimate is SPENT on the high-loot
        // targets — NO BOOKING walls (42x hp: the ult burst breaks the
        // siege open), bosses in range, and passout clusters. Damage +
        // invincibility, and the loot funds the build.
        // MINGUK ULT DOCTRINE (user): the ultimate is the roaming-boss and
        // passout killer — any of them in range is reason enough to fire.
        const lootTargets = !plan.hpPanic &&
            (plan.wallNear === true || plan.bossNear === true || (plan.passoutsNear || 0) >= 1 ||
             plan.roamingBoss === true);
        const linebackerBurst = !plan.hpPanic && (plan.lines || 0) > 0 && plan.boss === true;   // charging linebacker: ult damage + invincibility
        // USER: when mob HP scales past what five supers can kill, the ult
        // becomes the regular clear tool — fire on cooldown into any group.
        const scalingMobs = (plan.toughness || 0) > 2 && plan.near >= 2 && !plan.hpPanic;
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
        if (A.ultEnabled && hasGame('useUltimate') && now - lastUlt > ultGate &&
            (plan.near >= A.ultCrowd || plan.hpRatio < A.ultHpRatio ||
                defensive || offensive || emergency || entryHold || surgeCrowd || harvest || lootTargets || linebackerBurst || scalingMobs || ultSpam || contactSave)) {
            lastUlt = now;
            callGame('useUltimate');
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
            '<button id="pbRec" style="cursor:pointer" title="Record YOUR manual play as a teaching demo (stop the bot first)">🎥</button>' +
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
            infoEl.innerHTML =
                'tab: ' + TAB_ID + '   runs(all tabs): ' + learn.runs +
                (vs && vs.n ? '   this ver: ' + vs.n + ' runs, best ' + Math.round(vs.bestT / 60) + 'm' : '') + '<br>' +
                (hidden ? '<b style="color:#f88">⚠ background tab — game frozen by the browser; keep this window visible</b><br>' : '') +
                'state: <b style="color:#ffd98a">' + (st == null ? '(unreadable)' : st) + '</b><br>' +
                'move: ' + moveSource + '<br>' +
                'build: ' + (primaryCocktail || '—') + '<br>' +
                'picks: ' + runPicks.length + '<br>' +
                'model: CEM g' + learn.cem.gen + ' (' + learn.cem.batch.length + '/' + CONFIG.learning.batchSize + ')' +
                (championRun ? ' 👑' : '') +
                (lastDeathCause ? '   died→' + lastDeathCause : '') +
                (learn.hof.length ? '   best ' + learn.hof[0].r.toFixed(2) : '') +
                (learn.genHistory.length >= 2
                    ? (learn.genHistory[learn.genHistory.length - 1] > learn.genHistory[learn.genHistory.length - 2] ? ' ↑' : ' ↓')
                    : '') + '<br>' +
                (p ? p.diag + '<br>' : '') +
                'last: ' + String(lastAction).slice(0, 34);
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
                hallOfFame: learn.hof.map(h => +h.r.toFixed(3)),
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
        } catch (e) { setStatus('demo save failed: ' + e.message); }
        demoRec = null;
    }
    function demoTick() {
        if (!demoRec) return;
        const p = G.player; if (!p || G.state !== 'playing') return;
        const en = Array.isArray(G.enemies) ? G.enemies.filter(Boolean) : [];
        const fr = safe(() => frame, 0) || 0;
        let poD = null, bossD = null, wallD = null, near = 0;
        let frozenBossD = null, frozenN = 0, hpSum = 0, hpN = 0;
        for (const e of en) {
            const dd = Math.hypot(e.x - p.x, e.y - p.y);
            const ty = String(e.type), bc = String(e.bossChar || '');
            const froz = typeof e.frozenUntil === 'number' && e.frozenUntil > fr;
            if (froz) frozenN++;
            if (ty === 'passout') { if (poD == null || dd < poD) poD = Math.round(dd); continue; }
            if (/nobook/i.test(bc + ty)) { if (wallD == null || dd < wallD) wallD = Math.round(dd); }
            else if (ty === 'boss') {
                if (bossD == null || dd < bossD) bossD = Math.round(dd);
                // STALL DOCTRINE: how close does the user get to a PAUSED boss?
                if (froz && (frozenBossD == null || dd < frozenBossD)) frozenBossD = Math.round(dd);
            }
            if (typeof e.hp === 'number' && ty !== 'boss' && ty !== 'passout') { hpSum += e.hp; hpN++; }
            if (dd < 90) near++;
        }
        demoRec.samples.push({
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
            fx: typeof p.fireCrossUntil === 'number' && p.fireCrossUntil > fr ? 1 : 0
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
                    applyDefaults: () => applyParams(DEFAULT_PARAMS),
                    reloadLearn: () => { learn = loadLearn(); }
                }
            };
            window.pineBotDiagnose = diagnose;
            window.pineBotStats = buildStatsReport;
        } catch (e) { }
        if (CONFIG.autoStart) setTimeout(startBot, 900);
        // v6.83.1: end-to-end release test — no behaviour change. If this line
        // shows in the console after a self-update, the whole pipeline works.
        log('v' + scriptTag() + ' loaded (scoring profile: ' + CONFIG.scoringProfile + '). window.pineBot available — pineBot.compare() for the version table.');
        log('release pipeline check: 6.83.2 arrived via Violentmonkey AUTO-UPDATE ✔');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

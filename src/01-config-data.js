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

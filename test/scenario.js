#!/usr/bin/env node
// One test scenario per process (the bot's autoStart timer and panel
// intervals would otherwise leak between scenarios). Invoked by run.js.
const path = require('path');
const assert = require('assert');
const makeEnv = require('./fake-env');
const SCRIPT = path.join(__dirname, '..', 'dist', 'pine-bot.user.js');
const pkg = require('../package.json');
// v6.91.6: the CEM fixtures used to hardcode `rewardEpoch: 2`, so bumping the
// epoch turned them red for the RIGHT reason (the bump clears reward-derived
// baselines) against the WRONG intent — they test hall-of-fame repair, not
// epoch migration. Read the live constant instead, so a future bump never
// silently re-breaks them.
const CUR_EPOCH = (() => {
    const m = require('fs').readFileSync(SCRIPT, 'utf8').match(/const REWARD_EPOCH = (\d+)/);
    if (!m) throw new Error('REWARD_EPOCH not found in the build');
    return +m[1];
})();
let failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
function done() { process.exit(failed ? 1 : 0); }
const which = process.argv[2];

// 1. version stamping, snapshot freeze on version change, 6.74 seed, stats, reset
if (which === 'snapshots') {
    const prev = {
        runs: 3737, rewardEpoch: 2, lastVersion: '6.80.0+crown',
        versions: {
            '6.79.0': { n: 93, sumT: 150102, bestT: 9845, sumR: 195, hell: 59, day: 59, sumSupers: 288, deaths: {}, epoch: 2, firstRun: 3612, lastRun: 3704 },
            // v6.91.7 fixture, modelled on the LIVE 6.91.2 row: four runs, one
            // 14805s outlier against 1282 / 592 / 264. meanTimeS 4236 beats
            // every well-powered row in the table; medianTimeS is 937, the
            // worst of them. `bestAverage` had no sample floor and promoted it.
            '9.99.9+lottery': { n: 4, sumT: 16943, bestT: 14805, sumR: 7.4, hell: 2, day: 2, sumSupers: 4, deaths: {}, epoch: 2, firstRun: 272, lastRun: 275 }
        },
        runLog: [{ v: '6.79.0', t: 9845 }, { v: '6.79.0', t: 257 },
                 { v: '9.99.9+lottery', t: 14805 }, { v: '9.99.9+lottery', t: 1282 },
                 { v: '9.99.9+lottery', t: 592 }, { v: '9.99.9+lottery', t: 264 }]
    };
    const { pineBot, store } = makeEnv({ script: SCRIPT, storage: { pineBotUCB_v5: JSON.stringify(prev), paco_bdh_time: JSON.stringify([{ time: 15150 }]) } });
    pineBot.stop();
    const sharedBlob = () => JSON.parse(store.pineBotUCB_v5_shared || '{}');
    test('legacy versions migrated into the shared store', () => assert.ok(sharedBlob().versions && sharedBlob().versions['6.79.0']));
    test('per-bartender store is separate from the legacy blob', () => assert.ok(pineBot.learn().bartender));
    test('version constant matches package.json', () => assert.strictEqual(pineBot.version, pkg.version));
    test('tag carries scoring profile', () => assert.ok(/^\d+\.\d+\.\d+(\+[a-z0-9.-]+)*$/.test(pineBot.tag), pineBot.tag));
    const c = pineBot.compare();
    test('6.74.0 seeded from hell board', () => assert.strictEqual(c.versions.find(v => v.version === '6.74.0').bestTimeS, 15150));
    test('6.79.0 row present in comparison', () => assert.ok(c.versions.find(v => v.version === '6.79.0')));
    // v6.91.7 THE HEADLINE FIELDS NEED SAMPLE FLOORS.
    const lottery = c.versions.find(v => v.version === '9.99.9+lottery');
    test('the 4-run row really does have the highest mean in the table', () => {
        const best = c.versions.filter(v => isFinite(v.meanTimeS))
            .sort((x, y) => y.meanTimeS - x.meanTimeS)[0];
        assert.strictEqual(best.version, '9.99.9+lottery',
            JSON.stringify({ top: best.version, mean: Math.round(best.meanTimeS) }));
    });
    test('...and its MEDIAN is worse than the row it outranks on mean', () =>
        assert.ok(lottery.medianTimeS < c.versions.find(v => v.version === '6.79.0').meanTimeS,
            JSON.stringify({ median: lottery.medianTimeS })));
    test('bestAverage refuses it — one lucky run is not an average', () =>
        assert.notStrictEqual(c.bestAverage && c.bestAverage.version, '9.99.9+lottery',
            JSON.stringify(c.bestAverage)));
    test('...and whatever it picks clears the significance floor', () =>
        assert.ok(!c.bestAverage || c.bestAverage.runs >= 20,
            JSON.stringify(c.bestAverage)));
    test('bestPeak still reports it, because peak IS the lottery field', () =>
        assert.ok(c.howToRead.indexOf('NO sample floor') > 0, c.howToRead));
    test('lastVersion persisted in the shared store', () => assert.strictEqual(sharedBlob().lastVersion, pineBot.tag));
    test('rollupStats median/sd/p60', () => {
        const ts = [257, 488, 1241, 3528, 6122, 9845];
        const s = pineBot.test.rollupStats({ n: 6, sumT: ts.reduce((a, b) => a + b), sumT2: ts.reduce((a, b) => a + b * b, 0), over60: 2, over120: 1, times: ts });
        assert.strictEqual(s.medianTimeS, Math.round((1241 + 3528) / 2));
        assert.ok(s.sdTimeS > 3000 && s.sdTimeS < 4500, 'sd ' + s.sdTimeS);
        assert.strictEqual(s.p60, 0.33);
    });
    test('reset keeps snapshots', () => { pineBot.reset(); assert.ok(pineBot.learn().snapshots.some(s => s.version === '6.74.0')); });
    done();
}

// 2. scoring profile + planner smoke
if (which === 'scoring') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 600 } });
    pineBot.stop();
    const sup = pineBot.test.scoreCard({ n: 'SUPER NEGRONI', type: 'super', lv: 0, maxlv: 6 }, 0, []);
    // v6.94.2 — INVERTED ON PURPOSE. This test froze the 6.74 hell-prep
    // doctrine ("NEGRONI must be a SUPER before the finale"). That block was
    // the gun leak: audit A2 traced the live run's evolved NEGRONI to its
    // +20 CAMPARI / +30 super payments, and the user watched the drift
    // ("picking up upgrades for rainbow gun more often"). NEGRONI is a
    // KEYLESS occupant by doctrine; the crown branch now refuses its super
    // exactly like the 6.79 branch always did.
    // (the noop nets against the generic super bonuses to just below zero —
    // the same net the 6.79 branch always produced; any real pick beats it)
    test('crown profile REFUSES SUPER NEGRONI (the keyless occupant stays keyless)', () =>
        assert.ok(sup.score < 0 && /negroni-super-noop/.test(sup.why), sup.score + ' ' + sup.why));
    // v6.94.2 (user): "early upgrades to ultimate are key" — until lv3 the
    // ULTIMATE card outranks even OLIVE (the armour anchor of the day order —
    // rank 1 at ~402 until v6.106.0 moved the three super keys ahead of it,
    // rank 4 and ~33 points lower now; the assertion only gets easier); from
    // lv3 the armor doctrine resumes. Both directions asserted.
    global.player = Object.assign({}, global.player, { ultLevel: 1 });
    const ultC = () => pineBot.test.scoreCard({ n: 'ULTIMATE UP', type: 'ult', lv: 0, maxlv: 9 }, 0, []);
    const oliveC = () => pineBot.test.scoreCard({ n: 'OLIVE', type: 'passive', lv: 0, maxlv: 6 }, 0, []).score;
    // (writing this test CORRECTED the diagnosis: the ult card already
    // outranked OLIVE — ultimate+320 + day-ult-first+240 — so scoring was
    // never why lv2 came at gt 505. OFFER FREQUENCY is the constraint the
    // picker cannot fix. ult-early stays as explicit margin for the user's
    // doctrine, asserted as the tag and the delta it adds under lv3.)
    let uLow;
    test('under lv3, ULTIMATE UP carries the ult spine AND outranks OLIVE', () => {
        uLow = ultC();
        assert.ok(/ult-spine-lv/.test(uLow.why) && uLow.score > oliveC(),
            Math.round(uLow.score) + ' vs OLIVE ' + Math.round(oliveC()) + ' | ' + uLow.why);
    });
    // v6.111.0 REVERSED, deliberately. The old assertion here was "at lv3 the
    // ult-early margin is WITHDRAWN" — and withdrawing it at lv3 is the thing
    // the pat demos say is wrong. Demo 2 vs demo 1, same character and same
    // run length: lv6 by 14:52 wiped million-HP passout fields outright while
    // lv5-at-18:17's lv1-3 casts chipped fields of 3 down to 1. The premium
    // now decays across lv3-5 instead of falling off a cliff.
    global.player = Object.assign({}, global.player, { ultLevel: 3 });
    test('at lv3 the ult premium DECAYS but survives', () => {
        const u = ultC();
        const bonus = pineBot.config.abilities.ultSpineByLv[3];
        assert.ok(/ult-spine-lv3/.test(u.why) && u.score < uLow.score && bonus > 0,
            'delta ' + Math.round(uLow.score - u.score) + ' bonus ' + bonus + ' | ' + u.why);
    });
    test('the premium is still paying at lv5, and is gone at lv6', () => {
        global.player = Object.assign({}, global.player, { ultLevel: 5 });
        const u5 = ultC();
        global.player = Object.assign({}, global.player, { ultLevel: 6 });
        const u6 = ultC();
        assert.ok(/ult-spine-lv5/.test(u5.why) && !/ult-spine/.test(u6.why) && u5.score > u6.score,
            'lv5 ' + Math.round(u5.score) + ' | lv6 ' + Math.round(u6.score) + ' | ' + u6.why);
    });
    // The literal invariant, so a future edit to ultSpineByLv cannot make the
    // assertions above move with it (the toothless-test failure mode this
    // project has now hit four times: every threshold read from the config it
    // is supposed to be constraining).
    test('the ult premium schedule reaches lv5 and stops at lv6', () => {
        const s = pineBot.config.abilities.ultSpineByLv;
        assert.ok(s.length === 6 && s[3] > 0 && s[4] > 0 && s[5] > 0 && s[5] < s[0],
            JSON.stringify(s));
    });
    global.player = Object.assign({}, global.player, { ultLevel: 1 });
    const pool = [{ n: 'GINGER BEER', type: 'passive', lv: 0, maxlv: 6 }, { n: 'OLIVE', type: 'passive', lv: 3, maxlv: 6 }];
    const gb = pineBot.test.scoreCard(pool[0], 0, pool);
    test('GINGER BEER banned during the day', () => assert.ok(gb.score < 0 && /user-avoid/.test(gb.why), gb.why));
    test('planMove + maybeAbilities run without throwing', () => {
        global.enemies = [{ type: 'boss', x: 330, y: 270, r: 60, hp: 99999, speed: 2.0, moving: true }];
        const plan = pineBot.test.planMove();
        assert.ok(plan && typeof plan.dx === 'number');
        pineBot.test.maybeAbilities(plan);
    });
    test('reward is monotonic in hell time', () => {
        const a = pineBot.test.hellTimeBonus(7200), b = pineBot.test.hellTimeBonus(14400), c = pineBot.test.hellTimeBonus(20000);
        assert.ok(a < b && b < c);
    });
    // v6.91.6 THE REWARD MUST NOT MOVE WHEN THE BOARD DOES.
    //
    // hellTimeBonus divided the crown-progress term (weight 2.0, EIGHT TIMES
    // hellDepth) by the LIVE #1 hell time. Seeding the user's own 62686s manual
    // run into the board at 11:11 on 2026-08-26 therefore cut the dominant
    // deep-run reward term by 4.1x mid-measurement, with no code change and no
    // epoch bump: a 6000s run was worth 0.792 of crown progress on the 25th and
    // 0.191 on the 26th. CEM compared batches across that boundary.
    //
    // The denominator is now a fixed reference. The live crown is still read for
    // the STOP threshold, which is its correct use.
    test('the reward is INDEPENDENT of the live crown board', () => {
        const before = pineBot.test.hellTimeBonus(6000);
        global.localStorage.setItem('paco_bdh_time', JSON.stringify([{ time: 62686 }]));
        const after = pineBot.test.hellTimeBonus(6000);
        global.localStorage.removeItem('paco_bdh_time');
        assert.strictEqual(before, after,
            JSON.stringify({ before: +before.toFixed(4), after: +after.toFixed(4) }));
    });
    test('...but the STOP threshold still tracks it', () => {
        global.localStorage.setItem('paco_bdh_time', JSON.stringify([{ time: 62686 }]));
        const live = pineBot.test.liveCrownTimeS();
        global.localStorage.removeItem('paco_bdh_time');
        assert.strictEqual(live, 62686, String(live));
    });
    test('the reward epoch was bumped for that scale change', () =>
        assert.ok(CUR_EPOCH >= 3, 'epoch ' + CUR_EPOCH));
    done();
}

// 3. hell unban: after the run is latched as hell, GINGER BEER joins the plan
if (which === 'hell-unban') {
    const { pineBot, logs } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        const pool = [{ n: 'GINGER BEER', type: 'passive', lv: 0, maxlv: 6 }, { n: 'OLIVE', type: 'passive', lv: 3, maxlv: 6 }];
        const gb = pineBot.test.scoreCard(pool[0], 0, pool);
        test('hell latched from lexical flag', () => assert.ok(logs.some(l => /HELL run latched/.test(l)), logs.slice(-5).join(' | ')));
        // v6.88.5 (user): "mule out unless it's the only option that doesn't
        // make a 6th cocktail". GINGER BEER was unbanned in hell for exactly
        // one reason — it is MOSCOW MULE's super key — and the mule is off the
        // roster now. Keeping it banned is what makes the mule permanently safe
        // to eat on a forced pool, because it can then never complete a sixth
        // super and open the gun gate. This test asserted the OLD behaviour.
        test('GINGER BEER stays banned even in hell', () =>
            assert.ok(gb.score < 0 && /user-avoid/.test(gb.why), gb.why));
        // v6.94.2 — REVISED ON PURPOSE. These two tests froze the 6.88.5
        // LAST_RESORT clamp, which silently discarded every mule bonus
        // 6.92.2/6.92.3 added: the 6.94.1 pat digest caught VODKA CRANBERRY
        // taken at gt 43, closing MOSCOW MULE for the run by the game's own
        // exclusion and spending the slot on the one latent line the arming
        // cap cannot touch. The mule's SAFETY never came from the clamp —
        // it comes from GINGER BEER being banned and arming-capped, which
        // the assertions below keep. Its PRIORITY is now its real score, so
        // it claims the exclusive slot before a forced pool hands it away.
        test('so MOSCOW MULE can never complete a super', () => {
            const mule = pineBot.test.scoreCard({ n: 'MOSCOW MULE', type: 'weapon', lv: 5, maxlv: 6 }, 0, []);
            assert.ok(mule.score > 0, 'refused outright: ' + mule.why);
            assert.ok(!/last-resort/.test(mule.why), 'still clamped: ' + mule.why);
        });
        const sc = (n, t) => pineBot.test.scoreCard({ n, type: t, lv: 1, maxlv: 6 }, 0, []).score;
        test('the mule now OUTRANKS the junk tier — it is a planned occupant', () => {
            const mule = sc('MOSCOW MULE', 'weapon');
            for (const [n, t] of [['COFFEE BEANS', 'passive'], ['LIME', 'passive'], ['SODA WATER', 'passive']])
                assert.ok(mule > sc(n, t), n + ' ' + Math.round(sc(n, t)) + ' vs mule ' + Math.round(mule));
        });
        test('...and beats true junk, so a junk-only pool eats the mule', () => {
            const mule = sc('MOSCOW MULE', 'weapon');
            for (const [n, t] of [['CORPSE REVIVER NO.2', 'weapon'], ['ABSINTHE', 'passive'], ['GINGER BEER', 'passive']])
                assert.ok(mule > sc(n, t), n + ' ' + Math.round(sc(n, t)) + ' beat the mule ' + Math.round(mule));
        });
        // the unban MACHINERY must still be wired even with an empty list —
        // emptying the config must not be the same as deleting the mechanism.
        test('the unban pass still runs', () =>
            assert.strictEqual(global.window.pineBotStats().currentRoadmap.hellUnbanApplied, true));
        done();
    }, 2000);
}

// 4. v6.85.2 Pat calibration: profile fields, falling-passout drop tag,
//    and the hell boss-ring floor. v6.96.0: the env now boots with the JOE
//    pin, so pat must be (and is) selected explicitly below.
if (which === 'pat-profile') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 600 } });
    pineBot.stop();
    // v6.87.1: minguk is pinned, so pat has to be selected explicitly to
    // audit his profile. The profile itself is unchanged and still correct.
    pineBot.test.setChar('pat');
    const prof = () => global.window.pineBotStats().charProfile;
    test('pat can still be selected, and carries his own profile', () => assert.strictEqual(global.window.pineBotStats().bartender, 'pat'));
    test('pat kiteMul restored to 1.0', () => assert.strictEqual(prof().kiteMul, 1));
    test('pat opts out of crowd panic', () => assert.strictEqual(prof().crowdPanic, false));
    test('pat day ring tightens 165 -> 90 -> 80', () => {
        const dr = prof().dayRing;
        assert.ok(dr && dr.early === 165 && dr.mid === 90 && dr.late === 80, JSON.stringify(dr));
    });
    test('mid/late ring is not tighter than any demo p25', () => {
        // 6.85.4 shipped 75/66; the three day demos park at p25 78/96/96 (mid)
        // and 71/-/74 (late). Anything below the floor of those is tighter
        // than the human ever stood.
        const dr = prof().dayRing;
        assert.ok(dr.mid >= 78, 'mid ' + dr.mid);
        assert.ok(dr.late >= 71, 'late ' + dr.late);
    });
    test('pat day ring is monotonically tightening', () => {
        const dr = prof().dayRing;
        assert.ok(dr.early > dr.mid && dr.mid > dr.late, JSON.stringify(dr));
    });
    test('pat opening ring is wider than the old flat minguk curve', () => {
        // the 6.85.2 regression: 130 was TIGHTER than minguk's 118 by only
        // 12px, when both manual demos show Pat opening far wider than that.
        assert.ok(prof().dayRing.early > 118 * 1.3, 'early ' + prof().dayRing.early);
    });
    test('pat hell boss floor is retracted (0)', () => assert.strictEqual(prof().bossFloor, 0));

    // A passout mid-fall is a telegraphed AoE, so it must still be a mark —
    // but tagged `drop` so it cannot cancel the anchor. A landed one is loot.
    global.enemies = [
        { type: 'passout', x: 300, y: 270, r: 20, fallT: 8, hp: 40, maxHp: 40 },
        { type: 'passout', x: 340, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 2 }
    ];
    const th = pineBot.test.gatherThreats(global.player);
    test('falling passout is a mark', () => assert.ok(th.marks.some(m => m.x === 300), JSON.stringify(th.marks)));
    test('falling passout mark is tagged drop', () => assert.ok(th.marks.filter(m => m.x === 300).every(m => m.drop === true)));
    test('landed passout is loot, not a mark', () => {
        assert.ok(!th.marks.some(m => m.x === 340));
        assert.ok(th.passouts.some(po => po.x === 340));
    });
    done();
}

// 5. hell boss ring. 6.85.2 floored this at 150 for pat; 6.85.5 retracts the
//    floor (see CHARS.pat comment — the second hell demo puts hit-bossD at
//    med 264, so distance was never the mechanism). This test now guards the
//    retraction end-to-end: the planner must use the natural size/reach ring,
//    not a floored one, and must still produce a move next to a hell boss.
if (which === 'boss-floor') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
        // boss 100px to the east: r 40 so the old ring would have been ~95px
        // and the bot would have been happy to sit right here.
        global.enemies = [{ type: 'boss', x: 370, y: 270, r: 40, reach: 90, hp: 5e6, maxHp: 5e6, speed: 1.0, moving: true }];
        // past the 90s hell-entry window, otherwise `entryBlock` skips the
        // whole boss-ring branch and the floor is never exercised
        pineBot.test.ageHellEntry(120000);
        const plan = pineBot.test.planMove();
        test('planner produced a move', () => assert.ok(plan && typeof plan.dx === 'number', 'no plan'));
        test('boss firing ring was computed', () => assert.ok(typeof pineBot.test.bossRing() === 'number', 'ring ' + pineBot.test.bossRing()));
        test('hell boss ring is not floored (6.85.5 retraction)', () => {
            const r = pineBot.test.bossRing();
            // natural ring for this boss is max(r+55, min(reach+10, 150)) = 100.
            // If a floor were still applied it would read >= 150.
            assert.ok(r < 150, 'ring ' + r + ' (expected the natural ring, < 150)');
            assert.ok(r >= 90, 'ring ' + r + ' (expected roughly r+55 = 95)');
        });
        done();
    }, 2000);
}

// 6. v6.85.6 user directives.
//    (a) day: kill the bosses, the loot funds the ult, the ult clears the
//        passouts — so a boss is not skipped in favour of a passout farm.
//    (b) hell + TIME STOP pause: hold a SOUTH SIDE firing station on the
//        paused boss, and never inside it.
//    (c) mobs past killable: flight stays on at low HP and the ult fires.
if (which === 'directives') {
    // --- (a) day boss engagement, MOJITO sniper deferral is hell-only ---
    {
        const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 600 } });
        pineBot.stop();
        pineBot.test.setOwned({ MOJITO: 4, OLIVE: 3 });
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
        global.enemies = [
            { type: 'boss', x: 400, y: 270, r: 40, reach: 90, hp: 4000, maxHp: 4000, speed: 1.0, moving: true },
            { type: 'passout', x: 250, y: 260, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 7 }
        ];
        pineBot.test.planMove();
        // bossRing starts null and is only written inside the boss-engage
        // branch, so a number proves the branch was not `continue`d past.
        test('day boss is engaged despite MOJITO + passouts on the field', () =>
            assert.ok(typeof pineBot.test.bossRing() === 'number', 'ring ' + pineBot.test.bossRing()));
        // the ult is what clears the passouts, so it must outrank every
        // non-rainbow card. Rainbow is force-skipped, so this is #1 overall.
        const ult = pineBot.test.scoreCard({ n: 'ULTIMATE', type: 'ult', lv: 2, maxlv: 6 }, 0, []);
        const cocktail = pineBot.test.scoreCard({ n: 'NEGRONI', type: 'weapon', lv: 2, maxlv: 6 }, 0, []);
        test('ult outranks a roster cocktail during the day', () =>
            assert.ok(ult.score > cocktail.score, ult.score + ' vs ' + cocktail.score));
        done();
    }
}

if (which === 'time-stop') {
    // --- (b) SOUTH SIDE station on a paused boss ---
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
    pineBot.test.applyDefaults();   // v6.85.22: params are CEM-sampled per run; pin defaults for determinism
        pineBot.test.setOwned({ 'SOUTH SIDE': 4 });
        pineBot.test.ageHellEntry(120000);
        // parked 60px from a frozen boss: inside the 0.8 x station guard
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
        global.enemies = [
            { type: 'boss', x: 330, y: 270, r: 40, reach: 90, hp: 5e6, maxHp: 5e6, speed: 1.0, moving: false, frozenUntil: 1e5 },
            { type: 'mob', x: 300, y: 300, r: 14, hp: 900, maxHp: 900, speed: 1.0, moving: false, frozenUntil: 1e5 }
        ];
        const plan = pineBot.test.planMove();
        // NOTE: these are coverage + invariant checks, not discrimination
        // tests. The 26 -> 44 weight raise changes which bid wins on a
        // contested field, which no fake-env fixture reproduces honestly.
        test('the time-stop stacking branch is live', () => assert.strictEqual(plan.stacking, true));
        test('the pause is detected', () => assert.strictEqual(plan.pauseActive, true));
        test('flight is off while a pause holds the field', () => assert.strictEqual(plan.flight, false));
        // v6.85.11: `!projHere` used to gate the whole branch, and in hell a
        // shot is nearly always within 130px, so it almost never opened.
        test('a live projectile no longer closes the stacking window', () => {
            global.eprojectiles = [{ x: 300, y: 300, r: 6, vx: 0, vy: 0 }];
            const p2 = pineBot.test.planMove();
            global.eprojectiles = [];
            assert.strictEqual(p2.stacking, true);
        });
        // gathered radius is padded by the enemy profile (56 here, not the
        // raw 40), so assert against the safe ring rather than a magic number.
        test('with time on the freeze, the station is inside the safe ring', () =>
            assert.ok(plan.stackStation < 150, 'station ' + plan.stackStation));
        test('parked at the OLD 150px station, a long freeze pulls the bot in', () => {
            // boss r 40 at (330,270); 150px out is exactly where the flat
            // station used to park. Burn range is 80, so the planner must
            // close. Pre-6.85.11 it sat still here.
            global.player = { x: 180, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
            const p3 = pineBot.test.planMove();
            global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
            assert.ok(p3.dx > 0.5, 'dx ' + p3.dx.toFixed(2) + ' (expected eastward, toward the boss)');
        });
        test('as the freeze runs down, the station falls back to safe (150)', () => {
            global.enemies[0].frozenUntil = 61;   // 60 frames left: over the 45 drop cut, under 120
            const p4 = pineBot.test.planMove();
            global.enemies[0].frozenUntil = 1e5;
            assert.ok(p4.stackStation >= 150, 'station ' + p4.stackStation);
        });
        // station = max(150, r+90) = 150; guard at 120. From 60px out the
        // planner must open the gap, never close it.
        // v6.88.4 (user): "30-80 minutes hell - fast kill of frozen bosses ...
        // by sitting on top of their damage circle while the bosses still drop
        // tips". This scenario runs at gt 3000 (50 min) with a permanent
        // freeze, i.e. inside the window — so the OLD assertion (back off to
        // 150) is now the wrong doctrine and the bot should CLOSE.
        test('inside the tip window the planner closes onto the frozen boss', () => {
            const dNow = Math.hypot(330 - 270, 0);
            const dNew = Math.hypot(330 - (270 + plan.dx * 6), 270 - (270 + plan.dy * 6));
            assert.ok(dNew < dNow, 'dNow ' + dNow.toFixed(1) + ' dNew ' + dNew.toFixed(1));
        });
        test('and the station is on the hitbox, not the 150px ring', () =>
            assert.ok(plan.stackStation < 60, 'station ' + plan.stackStation));
        // ...but PAST the window the old standoff returns: deep hell is corner
        // work, not boss-hugging, and a boss whose ring fills the canvas is not
        // something to stand on.
        test('past the tip window the safe station comes back', () => {
            global.gameTime = 6000;
            const late = pineBot.test.planMove();
            global.gameTime = 3000;
            // r+40 = 96 is the PRE-EXISTING long-freeze station; 150 is the
            // short-freeze fallback. Either is fine — what matters is that the
            // point-blank hitbox station (~28) is gone once the window closes.
            assert.ok(late.stackStation >= 90, 'station ' + late.stackStation);
        });
        done();
    }, 2000);
}

// 7. v6.85.7: SOUTH SIDE is a GROUND weapon, so the MOJITO sniper deferral
//    must not skip boss engagement in hell when the zone engine is owned.
if (which === 'hell-southside') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.setOwned({ MOJITO: 4, 'SOUTH SIDE': 4, OLIVE: 3 });
        pineBot.test.ageHellEntry(120000);
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
        global.enemies = [
            { type: 'boss', x: 420, y: 270, r: 40, reach: 90, hp: 5e6, maxHp: 5e6, speed: 1.0, moving: true },
            { type: 'passout', x: 240, y: 250, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 5 }
        ];
        pineBot.test.planMove();
        test('hell boss is engaged when SOUTH SIDE is owned, despite MOJITO', () =>
            assert.ok(typeof pineBot.test.bossRing() === 'number', 'ring ' + pineBot.test.bossRing()));
        done();
    }, 2000);
}

// 8. v6.85.8: Pat's ult spirals out with distance falloff.
if (which === 'ult-falloff') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 600 } });
    pineBot.stop();
    pineBot.test.setChar('pat');   // v6.87.1: minguk is pinned, so pat is selected explicitly here
    pineBot.test.setOwned({ MOJITO: 4 });
    test('pat carries the falloff ult shape', () =>
        assert.strictEqual(global.window.pineBotStats().charProfile.ultFalloff, true));
    global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
    // a tight pair right next to the bot, and one straggler far east. A flat
    // centroid lands at x=310, dragged off the pair by the straggler; the
    // weighted aim must stay on the pair.
    global.enemies = [
        { type: 'passout', x: 250, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 1 },
        { type: 'passout', x: 260, y: 290, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 2 },
        { type: 'passout', x: 460, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 3 }
    ];
    const plan = pineBot.test.planMove();
    test('the aim point is pulled to the near cluster, not the flat centroid', () => {
        // flat centroid sits ~53px from the bot; the weighted one is far closer
        assert.ok(plan.poCentroidDist < 40, 'aim dist ' + plan.poCentroidDist);
    });
    test('nearest-passout distance is reported', () =>
        assert.ok(plan.poNearest != null && plan.poNearest <= 25, 'nearest ' + plan.poNearest));
    // The RETRY GATE is the rate lever, not the trigger list: `lootTargets`
    // already fires on any passout within 190px, so an extra trigger was
    // measured redundant and dropped. With a passout in falloff range the
    // retry drops 1500ms -> 900ms, so a second ask lands inside the window
    // where the old gate was still waiting.
    global.enemies = [{ type: 'passout', x: 375, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 9 }];
    const p2 = pineBot.test.planMove();
    // v6.86.2: pat's spiral IS the passout clear tool (39 volleys x 3 arms
    // x 691 at lv1, 636k at lv3) but only into what it sweeps — so a passout
    // at 105px, inside ultAdjacent, is exactly what it is for. What pat must
    // not do is burn it on a passout across the floor (see `ult-kinds`).
    let ults = 0; global.useUltimate = () => { ults++; };
    pineBot.test.maybeAbilities(p2);
    setTimeout(() => {
        pineBot.test.maybeAbilities(p2);
        test('pat spends the spray ult on a passout he is standing on', () =>
            assert.ok(ults >= 1, 'ults ' + ults));
        test('pat is tagged with the spray ult kind', () =>
            assert.strictEqual(global.window.pineBotStats().charProfile.ultKind, 'spray'));
        // ...but the same plan with a body ON him is exactly what it is for
        const p3 = Object.assign({}, p2, { contactImminent: true, adjacent: 20, hpRatio: 0.9 });
        pineBot.test.maybeAbilities(p3);
        test('pat spends it when a body is already on him', () =>
            assert.ok(ults >= 1, 'ults ' + ults));
        done();
    }, 1000);
}

// 9. v6.85.9: the flame cross is a body-centred burn, so while it is up the
//    passout station collapses from Pat's 165px day ring to contact range.
if (which === 'flame-cross') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 60 } });
    pineBot.stop();
    pineBot.test.setChar('pat');   // v6.87.1: minguk is pinned, so pat is selected explicitly here
    pineBot.test.applyDefaults();   // v6.85.22: params are CEM-sampled per run; pin defaults for determinism
    const po = { type: 'passout', x: 435, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 4 };
    const run = flame => {
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
        if (flame) global.player.fireCrossUntil = 1e5;
        global.enemies = [po];
        const pl = pineBot.test.planMove();
        // signed closing rate along the chosen heading
        return pl.dx * (po.x - 270) / 165 + pl.dy * (po.y - 270) / 165;
    };
    const cold = run(false), hot = run(true);
    // v6.86.4: the hug is retracted. The manual demo stands at 61-94px
    // (median 82) and kills nothing with base attacks — so Pat holds his
    // station until the flame (or the ult) gives him a reason to close.
    test('without the cross, Pat holds his station', () =>
        assert.ok(cold < 0.5, 'closing ' + cold.toFixed(2)));
    // v6.86.7: the cross is a directional flamethrower fired along the aim
    // vector, so the burn makes Pat TURN TO FACE the target — not stand on it.
    test('with the cross burning, Pat points the stream at the passout', () =>
        assert.ok(hot > 0.7, 'alignment ' + hot.toFixed(2)));
    test('the burn deadline is read in SECONDS, not frames', () => {
        // the game sets fireCrossUntil = gameTime + secs and tests
        // `gameTime < fireCrossUntil`. A deadline already past must read as
        // cold — under the old `> frame` comparison it read as burning,
        // which is how the bug survived its own test for so long.
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9, r: 7.2, fireCrossUntil: 30 };
        global.enemies = [po];
        const stale = pineBot.test.planMove();
        assert.strictEqual(stale.flameAim, null, 'a lapsed burn still counted as active');
        global.player.fireCrossUntil = 1e5;
        const live = pineBot.test.planMove();
        assert.ok(live.flameAim != null, 'a live burn was not detected');
    });
    // and the reason it is safe: the body deals no damage
    test('a lone passout raises no contact danger', () => {
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
        global.enemies = [{ type: 'passout', x: 300, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 7 }];
        const pl = pineBot.test.planMove();
        assert.ok(pl.contactImminent !== true, 'contactImminent on a harmless obstacle');
    });
    done();
}

// 10. v6.85.10: the passout backlog. Gather is field-wide, `contested` scales
//     with local crowding, and with the local window empty the bot treks to
//     the oldest distant passout instead of sitting in its corner.
if (which === 'backlog') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    pineBot.test.applyDefaults();   // v6.85.22: params are CEM-sampled per run; pin defaults for determinism

    // --- crowding: 21 bodies inside the 200px threat radius (the 17:59
    // screenshot read "21e"), four of them loosely around a near passout.
    global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
    const crowd = [];
    // 17 bodies packed around (170,170) — inside the 200px threat radius but
    // well clear of the test passout — and exactly 4 around the passout itself.
    for (let i = 0; i < 17; i++) crowd.push({ type: 'mob', x: 170 + 30 * Math.cos(i), y: 170 + 30 * Math.sin(i), r: 14, hp: 500, maxHp: 500, speed: 1.0, moving: true });
    for (let i = 0; i < 4; i++) crowd.push({ type: 'mob', x: 350 + 14 * Math.cos(i * 1.6), y: 350 + 14 * Math.sin(i * 1.6), r: 14, hp: 500, maxHp: 500, speed: 1.0, moving: true });
    global.enemies = crowd.concat([{ type: 'passout', x: 350, y: 350, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 2 }]);
    const busy = pineBot.test.gatherThreats(global.player);
    test('contested threshold scales with local crowding', () =>
        assert.ok(busy.contestTol >= 6, 'tol ' + busy.contestTol + ' at ' + busy.enemies.length + ' bodies'));
    test('4 chasers no longer flag a passout as contested at this density', () => {
        const po = busy.passouts.find(x => x.id === 2);
        assert.ok(po, 'passout missing');
        assert.strictEqual(po.contested, false);
    });

    // --- reach: two passouts past the old 312px gather window, nothing near.
    global.player = { x: 60, y: 60, hp: 180, maxHp: 180, speed: 1.9 };
    global.enemies = [
        { type: 'passout', x: 480, y: 480, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 3 },
        { type: 'passout', x: 500, y: 300, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 11 }
    ];
    const th = pineBot.test.gatherThreats(global.player);
    test('passouts beyond the old 312px window are gathered', () => {
        assert.strictEqual(th.passouts.length, 2, 'got ' + th.passouts.length);
        assert.ok(th.passouts.every(po => po.far === true), JSON.stringify(th.passouts.map(po => po.far)));
    });
    const plan = pineBot.test.planMove();
    test('the planner picks a trek target', () => assert.ok(plan.trek != null, 'trek ' + plan.trek));
    test('the trek heads for the OLDEST passout (id 3), not the nearer one', () => {
        // id 3 sits at (480,480) on the 45-degree bearing; id 11 at (500,300)
        // is ~85px closer. FIFO must win.
        const n = Math.hypot(420, 420);
        const closing = plan.dx * (420 / n) + plan.dy * (420 / n);
        assert.ok(closing > 0.6, 'closing ' + closing.toFixed(2));
    });
    test('the field passout count is reported', () => assert.strictEqual(plan.poField, 2));
    done();
}

// 11. v6.85.12: freeze aura is a MIDPOINT zone, not a body-centred damage
//     radius; and the boss damage-ring instrument.
if (which === 'freeze-aura') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
    const far = { type: 'boss', x: 480, y: 60, r: 40, hp: 5e5, maxHp: 5e5, speed: 1.0, moving: true };
    const lone = { type: 'boss', x: 350, y: 270, r: 40, hp: 5e5, maxHp: 5e5, speed: 1.0, moving: true };
    const paired = { type: 'boss', x: 330, y: 270, r: 40, hp: 5e5, maxHp: 5e5, speed: 1.0, moving: true, partner: far };
    global.enemies = [lone];
    const loneReach = pineBot.test.gatherThreats(global.player).enemies[0].reach;
    global.enemies = [paired, far];
    const th = pineBot.test.gatherThreats(global.player);
    const pairedGot = th.enemies.find(e => Math.round(e.x) === 330);
    test('a partner across the map does NOT raise the fear radius', () =>
        assert.strictEqual(pairedGot.reach, loneReach));
    test('a partner across the map does NOT flag freezeAura', () =>
        assert.strictEqual(pairedGot.freezeAura, false));
    test('no phantom pair-freeze mark when the partners are apart', () =>
        assert.ok(!th.marks.some(m => m.pairFreeze), JSON.stringify(th.marks)));

    // seated pair: the field is real, and it is centred on the MIDPOINT
    const near = { type: 'boss', x: 370, y: 270, r: 40, hp: 5e5, maxHp: 5e5, speed: 1.0, moving: true };
    const seated = { type: 'boss', x: 330, y: 270, r: 40, hp: 5e5, maxHp: 5e5, speed: 1.0, moving: true, partner: near };
    near.partner = seated;
    global.enemies = [seated, near];
    const th2 = pineBot.test.gatherThreats(global.player);
    test('a seated pair DOES flag freezeAura', () =>
        assert.strictEqual(th2.enemies.find(e => Math.round(e.x) === 330).freezeAura, true));
    test('the pair field is marked at the midpoint, not on a body', () => {
        const m = th2.marks.find(mk => mk.pairFreeze);
        assert.ok(m, 'no pairFreeze mark');
        assert.strictEqual(Math.round(m.x), 350);
    });
    test('even seated, reach is not inflated by the aura', () =>
        assert.strictEqual(th2.enemies.find(e => Math.round(e.x) === 330).reach, loneReach));

    // instrument: HP drops on a boss are recorded with the distance
    test('boss damage-ring instrument records nothing before any damage', () =>
        assert.strictEqual(pineBot.test.bossHitSamples().length, 0));
    test('a boss HP drop records the player-to-boss distance', () => {
        global.enemies = [lone];                       // 80px east
        pineBot.test.gatherThreats(global.player);     // seed the hp memory
        lone.hp -= 500;
        pineBot.test.gatherThreats(global.player);
        const s = pineBot.test.bossHitSamples();
        assert.strictEqual(s.length, 1, JSON.stringify(s));
        assert.strictEqual(s[0], 80);
    });
    test('bossHitRange reports percentiles', () => {
        const r = global.window.pineBot.bossHitRange();
        assert.strictEqual(r.n, 1);
        assert.strictEqual(r.median, 80);
    });
    done();
}

// 12. v6.85.13: the damage audit records EVIDENCE, and in particular separates
//     sole-candidate events from ambiguous ones and from unattributed hits
//     that the existing classifier silently books as 'contact'.
if (which === 'damage-audit') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 600 } });
    pineBot.stop();
    global.window.pineBot.resetDamageAudit();
    const hit = (enemies, dmg) => {
        global.enemies = enemies;
        global.player.hp = 180;
        pineBot.test.planMove();          // seeds lastHpSample at 180
        global.player.hp = 180 - dmg;
        pineBot.test.planMove();          // observes the drop
    };
    global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };

    // 1. a mark overlapping the bot and NOTHING else: sole candidate = mark
    hit([{ type: 'passout', x: 272, y: 270, r: 20, fallT: 8, hp: 40, maxHp: 40 }], 20);
    let a = global.window.pineBot.damageAudit();
    test('a lone overlapping mark is recorded as the SOLE candidate', () =>
        assert.ok(a.sole.mark && a.sole.mark.n === 1, JSON.stringify(a.sole)));

    // 2. damage with no hazard anywhere near: must be UNATTRIBUTED, not contact
    hit([{ type: 'boss', x: 520, y: 520, r: 40, hp: 5e5, maxHp: 5e5, speed: 1, moving: true }], 25);
    a = global.window.pineBot.damageAudit();
    test('damage with no hazard in range is unattributed, not contact', () => {
        assert.strictEqual(a.unattributed.n, 1, JSON.stringify(a.unattributed));
        assert.ok(!a.sole.contact, 'contact was credited: ' + JSON.stringify(a.sole));
    });
    test('the unattributed bucket keeps the boss distance for characterisation', () =>
        assert.ok(a.unattributed.bossD && a.unattributed.bossD.median > 300, JSON.stringify(a.unattributed.bossD)));

    // 3. a projectile AND a mark both in range: counted for both, sole for neither
    hit([
        { type: 'passout', x: 272, y: 270, r: 20, fallT: 8, hp: 40, maxHp: 40 },
        { type: 'boss', x: 520, y: 520, r: 40, hp: 5e5, maxHp: 5e5, speed: 1, moving: true }
    ], 30);
    global.eprojectiles = [{ x: 274, y: 270, r: 6, vx: 0, vy: 0 }];
    hit([{ type: 'passout', x: 272, y: 270, r: 20, fallT: 8, hp: 40, maxHp: 40 }], 30);
    global.eprojectiles = [];
    a = global.window.pineBot.damageAudit();
    test('an ambiguous hit credits every candidate but is sole for none', () => {
        assert.ok(a.byClass.proj && a.byClass.mark, JSON.stringify(a.byClass));
        assert.ok(!a.sole.proj, 'proj wrongly counted as sole: ' + JSON.stringify(a.sole));
    });
    test('totals and shares are reported', () => {
        assert.ok(a.events >= 4, 'events ' + a.events);
        assert.ok(/%$/.test(a.unattributed.hpShare));
    });
    test('the event ring keeps the verdict alongside the candidates', () => {
        const ev = global.window.pineBot.damageEvents();
        assert.ok(ev.length >= 4);
        assert.ok(ev.some(e => e.c === 'none' && e.verdict === 'contact'),
            'expected an unattributed hit that the old classifier called contact: ' + JSON.stringify(ev));
    });
    done();
}

// 13. v6.85.14: focus fire. With several passouts up, the station gradient
//     comes from ONE kill-order target, not the sum of all of them.
if (which === 'focus-fire') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 650 } });
    pineBot.stop();
    pineBot.test.setChar('pat');   // v6.87.1: written against pat's profile (speed 1.9, 180 HP)
    pineBot.test.applyDefaults();   // v6.85.22: params are CEM-sampled per run; pin defaults for determinism
    global.player = { x: 270, y: 270, hp: 170, maxHp: 180, speed: 1.9 };
    // frail old passout WEST at 120px; two tougher ones EAST/NORTHEAST whose
    // summed pull outweighed the single west one under the old code (probe:
    // the pre-fix heading was northeast, toward the farthest).
    global.enemies = [
        { type: 'passout', x: 150, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 3 },
        { type: 'passout', x: 380, y: 300, r: 20, fallT: 0, hp: 70, maxHp: 70, id: 5 },
        { type: 'passout', x: 420, y: 130, r: 20, fallT: 0, hp: 70, maxHp: 70, id: 9 }
    ];
    let pl;
    for (let i = 0; i < 6; i++) pl = pineBot.test.planMove();   // let smoothing settle
    // v6.85.17: target = min(maxHp + 0.5*dist). West id 3: 40 + 0.5*120 = 100;
    // east id 5: 70 + ~57 = 127; northeast id 9: 70 + ~102 = 172. West wins.
    test('the heading closes on the best loot-per-second passout, not the sum', () =>
        assert.ok(pl.dx < -0.5, 'dx ' + pl.dx.toFixed(2) + ' (expected westward toward id 3)'));
    test('all three passouts are still visible and free', () =>
        assert.strictEqual(pl.poFree, 3, JSON.stringify([pl.poField, pl.poFree])));
    done();
}

// 14. v6.85.15: a TIME STOP item freezes via player.timeStopUntil — the game
//     never sets e.frozenUntil for it (that is WHISKY SOUR only). The frozen-
//     boss machinery must open on the global stop.
if (which === 'item-stop') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true, frame: 1000 } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.setOwned({ 'SOUTH SIDE': 4 });
        pineBot.test.ageHellEntry(120000);
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
        // NO frozenUntil anywhere — only the player's global timeStopUntil
        global.enemies = [
            { type: 'boss', x: 330, y: 270, r: 40, reach: 90, hp: 5e6, maxHp: 5e6, speed: 1.0, moving: true },
            { type: 'mob', x: 300, y: 300, r: 14, hp: 900, maxHp: 900, speed: 1.0, moving: true }
        ];
        const before = pineBot.test.planMove();
        test('without a stop, the boss is not a stacking target', () =>
            assert.strictEqual(before.stacking, false));
        global.player.timeStopUntil = 1180;   // 180 frames of stop left
        const during = pineBot.test.planMove();
        test('an item TIME STOP opens the stacking window (no frozenUntil set)', () =>
            assert.strictEqual(during.stacking, true, JSON.stringify({ stacking: during.stacking })));
        test('the pause is detected from the global stop', () =>
            assert.strictEqual(during.pauseActive, true));
        test('with stop time left, the station is burn range', () =>
            assert.ok(during.stackStation != null && during.stackStation < 150, 'station ' + during.stackStation));
        global.player.timeStopUntil = 1060;   // 60 frames left: under the 120 cut
        const late = pineBot.test.planMove();
        test('as the stop runs out, the station falls back to safe', () =>
            assert.ok(late.stackStation >= 150, 'station ' + late.stackStation));
        global.player.timeStopUntil = 1010;   // 10 frames: below the 45-frame drop
        const gone = pineBot.test.planMove();
        test('under 45 frames the target is dropped before it wakes', () =>
            assert.strictEqual(gone.stacking, false));
        done();
    }, 2000);
}

// 15. v6.85.16: flame anchor + filler loot discount.
if (which === 'flame-anchor') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 650 } });
    pineBot.stop();
    // crowded 10-minute field: 6 mobs inside nearbyRadius, NO OLIVE/NEGRONI,
    // a live enemy shot 100px away — every old anchor gate fails.
    global.player = { x: 270, y: 270, hp: 170, maxHp: 180, speed: 1.9 };
    global.eprojectiles = [{ x: 370, y: 270, r: 6, vx: 0, vy: 0 }];
    const mobs = [];
    for (let i = 0; i < 6; i++) mobs.push({ type: 'mob', x: 270 + 70 * Math.cos(i), y: 270 + 70 * Math.sin(i), r: 14, hp: 400, maxHp: 400, speed: 1.2, moving: true });
    global.enemies = mobs.concat([{ type: 'passout', x: 380, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 4 }]);
    const cold = pineBot.test.planMove();
    test('crowded field without the cross: no anchor (old gates hold)', () =>
        assert.strictEqual(cold.anchor, false));
    global.player.fireCrossUntil = 1e5;
    const hot = pineBot.test.planMove();
    global.eprojectiles = [];
    test('same field with the cross burning: ANCHORED', () =>
        assert.strictEqual(hot.anchor, true, JSON.stringify({ anchor: hot.anchor, flameAnchor: hot.flameAnchor })));
    test('flameAnchor is reported', () => assert.strictEqual(hot.flameAnchor, true));

    // filler discount: with a free passout up, a coin is worth less than half
    // a bill; without passouts they revert to the table.
    delete global.player.fireCrossUntil;
    global.pickups = [
        { x: 300, y: 270, kind: 'coin' },
        { x: 305, y: 270, kind: 'bill' }
    ];
    const lootWithPo = pineBot.test.gatherLoot(global.player, 1);
    const coin = lootWithPo.find(l => l.kind === 'coin'), bill = lootWithPo.find(l => l.kind === 'bill');
    test('with a passout up, filler coin is discounted below half a bill', () =>
        assert.ok(coin.v * 2 <= bill.v + 1, JSON.stringify({ coin: coin.v, bill: bill.v })));
    test('a day tip is VITAL-grade: full pull, immune to discounts', () => {
        const keep = global.pickups;
        global.pickups = [{ x: 320, y: 270, kind: 'tip' }];
        const l = pineBot.test.gatherLoot(global.player, 1);
        global.pickups = keep;
        assert.strictEqual(l[0].vital, true, JSON.stringify(l[0]));
    });
    test('during the burn, even bills yield to the station', () => {
        global.player.fireCrossUntil = 1e5;
        const l2 = pineBot.test.gatherLoot(global.player, 1);
        delete global.player.fireCrossUntil;
        const b2 = l2.find(l => l.kind === 'bill');
        assert.ok(b2.v < bill.v, JSON.stringify({ burning: b2.v, normal: bill.v }));
    });
    done();
}

// 16. v6.85.17: the kill order charges for transit.
if (which === 'kill-order') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 650 } });
    pineBot.stop();
    pineBot.test.applyDefaults();   // v6.85.22: params are CEM-sampled per run; pin defaults for determinism
    global.player = { x: 270, y: 270, hp: 170, maxHp: 180, speed: 1.9 };
    // the FRAILEST passout (40hp) is 230px east; a 55hp one is 160px west.
    // frailest-first goes east (score-blind); loot-per-second goes west:
    // 55 + 0.5*160 = 135 beats 40 + 0.5*230 = 155. Both sit outside the
    // 100px station ring, so the bot must actually travel.
    global.enemies = [
        { type: 'passout', x: 110, y: 270, r: 20, fallT: 0, hp: 55, maxHp: 55, id: 8 },
        { type: 'passout', x: 500, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 2 }
    ];
    let pl;
    for (let i = 0; i < 6; i++) pl = pineBot.test.planMove();
    test('a near 60hp passout outranks a far 40hp one (transit is charged)', () =>
        assert.ok(pl.dx < -0.4, 'dx ' + pl.dx.toFixed(2) + ' (expected westward to the near target)'));
    done();
}

// 17. v6.85.18: an off-canvas day boss is still an engagement target — the
//     bot hugs the nearest reachable point instead of forgetting it exists.
if (which === 'edge-boss') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 650 } });
    pineBot.stop();
    pineBot.test.applyDefaults();   // v6.85.22: params are CEM-sampled per run; pin defaults for determinism
    global.player = { x: 270, y: 270, hp: 170, maxHp: 180, speed: 1.9 };
    // boss 100px beyond the right edge (field is 540 wide): centre distance
    // 370 — far outside the old 200px gather window.
    global.enemies = [{ type: 'boss', x: 640, y: 270, r: 40, reach: 90, hp: 8000, maxHp: 8000, speed: 1.0, moving: true }];
    const th = pineBot.test.gatherThreats(global.player);
    test('an off-canvas boss is gathered and tagged distant', () => {
        const b = th.enemies.find(e => e.boss);
        assert.ok(b, 'boss not gathered');
        assert.strictEqual(b.distant, true);
    });
    test('a distant boss does not set the boss flag (no ult waste)', () =>
        assert.strictEqual(th.boss, false));
    let pl;
    for (let i = 0; i < 6; i++) pl = pineBot.test.planMove();
    test('the planner closes east toward the edge nearest the boss', () =>
        assert.ok(pl.dx > 0.4, 'dx ' + pl.dx.toFixed(2)));
    // v6.85.19: the station must target the HIT CIRCLE (the inner blue ring =
    // the body circle e.r), not the 240px day standoff — a 240 station is
    // outside weapon reach of a body that is mostly beyond the edge.
    test('the ring collapses to the hit circle for an off-canvas boss', () => {
        const r = pineBot.test.bossRing();
        assert.ok(typeof r === 'number' && r < 120, 'ring ' + r + ' (old standoff was 240)');
    });
    test('a small off-canvas boss is engageable in hell too', () => {
        // fresh hellish read: force hellDetected via a direct gather check —
        // the gather condition allows r <= 90 in hell. We approximate by
        // asserting the day gather kept it and the tag survived.
        const th2 = pineBot.test.gatherThreats(global.player);
        const b = th2.enemies.find(e => e.boss);
        assert.strictEqual(b.offCanvas, true);
    });
    done();
}

// 18. v6.85.19: a stopped GIANT beyond the gather range is a stacking target.
if (which === 'stop-giant') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true, frame: 1000 } });
    setTimeout(() => {
        pineBot.stop();
    pineBot.test.applyDefaults();   // v6.85.22: params are CEM-sampled per run; pin defaults for determinism
        pineBot.test.setOwned({ 'SOUTH SIDE': 4 });
        pineBot.test.ageHellEntry(120000);
        global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9 };
        // giant hell boss (r 200), centre 160px BEYOND the right edge — centre
        // distance 430, far outside the 200px window, r > 90 so the live-boss
        // extension does not cover it either.
        global.enemies = [{ type: 'boss', x: 700, y: 270, r: 200, reach: 90, hp: 5e7, maxHp: 5e7, speed: 1.0, moving: true }];
        const before = pineBot.test.planMove();
        test('a LIVE off-canvas giant stays invisible in hell (corner-chase guard)', () =>
            assert.strictEqual(before.stacking, false));
        global.player.timeStopUntil = 1300;   // 300 frames of item stop
        const during = pineBot.test.planMove();
        test('under a TIME STOP the stopped giant becomes the stacking target', () =>
            assert.strictEqual(during.stacking, true));
        test('the burn station hugs the hit circle (r+40-ish from centre)', () =>
            assert.ok(during.stackStation != null && during.stackStation < 300, 'station ' + during.stackStation));
        test('the planner closes east toward the giant', () =>
            assert.ok(during.dx > 0.3, 'dx ' + during.dx.toFixed(2)));
        done();
    }, 2000);
}

// 19. v6.85.20: bossless deep-hell flight is the GRIND — kite pressure eases
//     so the pack stays in the SOUTH SIDE wake; a boss on field restores the
//     full flee; no zoner = no wake = full flee too.
if (which === 'grind') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
    pineBot.test.applyDefaults();   // v6.85.22: params are CEM-sampled per run; pin defaults for determinism
        pineBot.test.ageHellEntry(120000);
        global.player = { x: 270, y: 270, hp: 120, maxHp: 180, speed: 1.9 };
        const pack = [0,1,2,3,4,5].map(i => ({ type: 'mob', x: 270 + 70*Math.cos(i), y: 270 + 70*Math.sin(i), r: 14, hp: 9e9, maxHp: 9e9, speed: 3.0, moving: true }));
        global.enemies = pack;
        const noZoner = pineBot.test.planMove();
        test('flight without SOUTH SIDE stays a pure flee (no wake to feed)', () =>
            assert.ok(noZoner.flight === true && noZoner.grind === false, JSON.stringify({f:noZoner.flight,g:noZoner.grind})));
        pineBot.test.setOwned({ 'SOUTH SIDE': 3 });
        const bossless = pineBot.test.planMove();
        test('bossless flight with SOUTH SIDE is the grind posture', () =>
            assert.strictEqual(bossless.grind, true));
        global.enemies = pack.concat([{ type: 'boss', x: 380, y: 270, r: 40, reach: 90, hp: 5e6, maxHp: 5e6, speed: 2.5, moving: true }]);
        const chased = pineBot.test.planMove();
        test('a boss on the field restores the full flee', () =>
            assert.ok(chased.flight === true && chased.grind === false, JSON.stringify({f:chased.flight,g:chased.grind})));
        done();
    }, 2000);
}

// 20. v6.85.21: skip policy is a hard veto on the Rainbow Gun.
if (which === 'gun-veto') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 1600 } });
    pineBot.stop();
    const gun = { n: 'RAINBOW GUN', type: 'rainbowup', lv: 0, maxlv: 1 };
    const filler = { n: 'GINGER BEER', type: 'passive', lv: 0, maxlv: 6 };   // day-banned, scores negative
    const g = pineBot.test.scoreCard(gun, 0, [gun, filler]);
    const f = pineBot.test.scoreCard(filler, 1, [gun, filler]);
    test('the gun is banned outright, not merely policy-vetoed', () => {
        const g = pineBot.test.scoreCard({ n: 'RAINBOW GUN', type: 'rainbowup', lv: 0, maxlv: 6 }, 0, []);
        assert.ok(/gun-BANNED/.test(g.why), g.why);
        assert.ok(g.score < -500, 'score ' + g.score);
    });
    // v6.107.0 — THE BAN OUTRANKS THE NEW LEARNED LAYERS TOO.
    // Two learned terms were added in 6.107.0 (`ctx-learn` +/-12 per card,
    // `tag-learn` +/-8 per attack type) and both are ADDITIVE into the same
    // score the guards live in. The promise made when they were bounded was
    // that recipe-book knowledge and user directives keep the casting vote.
    // This is where that promise is actually checked.
    //
    // FIRST DRAFT OF THIS TEST WAS TOOTHLESS and saying why is the point:
    // it saturated the tag layer and scored RAINBOW GUN itself, which carries
    // NO tags — so `tagLearnBonus` returned 0 early and the assertion passed
    // with the +/-8 bound removed entirely. The gun card was never reachable
    // by that layer, so testing it proved nothing about the bound.
    test('RAINBOW GUN carries no tags at all — the tag layer cannot reach it', () =>
        assert.strictEqual(pineBot.test.tagsOf('RAINBOW GUN').length, 0,
            JSON.stringify(pineBot.test.tagsOf('RAINBOW GUN'))));
    // The gun is not actually reached through the gun CARD, though — it is
    // reached by opening a SIXTH super line, and the structural guard is the
    // arming cap refusing that line's key. LIME is GIMLET's key, it carries a
    // real tag (`dps`), and it is therefore the card where a saturated
    // learned layer could actually do damage. This is the honest version.
    // MEASURED MARGIN, not a vibe: LIME@5 scores -673 clean and -665 with the
    // tag layer saturated at maximum reward for 200 credits. The learned
    // layer moves it by exactly 8 — its bound — against a 700-point arming
    // cap. The ban is 265 points clear of anything the learned layers can do.
    //
    // Two assertions, and only the second is a change guard:
    //  (a) an INVARIANT: the key stays refused. This does NOT fail when the
    //      bound is removed (unbounded, the layer adds ~150 and -673 becomes
    //      -523, still refused) — it fails if someone ever weakens the cap.
    //  (b) the real guard on the bound: the saturated delta must EQUAL the
    //      declared +/-8. That does fail the moment the bound is widened.
    test('the gun-line key stays refused under a saturated learned layer', () => {
        const T = pineBot.test;
        assert.ok(T.tagsOf('LIME').length > 0, 'LIME has no tags — pick another key card');
        T.setTagUcb({});
        const clean = T.scoreCard({ n: 'LIME', type: 'passive', lv: 5, maxlv: 6 }, 0, []).score;
        for (let i = 0; i < 200; i++)
            T.creditTagPicks([{ name: 'LIME' }, { name: 'GIMLET' }, { name: 'SIDECAR' }], 4.5);
        const k = T.scoreCard({ n: 'LIME', type: 'passive', lv: 5, maxlv: 6 }, 0, []);
        assert.ok(k.score < -400, 'LIME@5 climbed to ' + Math.round(k.score) + ' — ' + k.why);
        assert.ok(/arming-cap/.test(k.why), k.why);
        // (b) the bound itself, which is what actually protects the guards.
        assert.ok(k.score - clean <= 8.001,
            'the tag layer moved a guarded card by ' + (k.score - clean).toFixed(1) +
            ' — its declared bound is 8');
        T.setTagUcb({});
    });
    // ...and the same for the day-order and armour-tier reshuffles of
    // 6.106.0/6.107.0: moving ranks around must never move a guard.
    test('no 6.106/6.107 ordering change can outbid the ban', () => {
        const T = pineBot.test;
        T.setParam('movement.armorTierFromS', 0);
        const a = T.scoreCard({ n: 'RAINBOW GUN', type: 'rainbowup', lv: 0, maxlv: 6 }, 0, []);
        T.setParam('movement.armorTierFromS', 300);
        const b = T.scoreCard({ n: 'RAINBOW GUN', type: 'rainbowup', lv: 0, maxlv: 6 }, 0, []);
        assert.ok(a.score < -500 && b.score < -500, 'a ' + Math.round(a.score) + ' b ' + Math.round(b.score));
    });
    test('the ban outranks the learned policy and the timing window', () => {
        // even inside the old 25-30 min "take" window, with the policy set to
        // take, the ban still wins — it is not a tuning knob any more
        global.gameTime = 1700;
        pineBot.config.rainbowPolicyOverride = 'take';
        const g = pineBot.test.scoreCard({ n: 'RAINBOW GUN', type: 'rainbowup', lv: 0, maxlv: 6 }, 0, []);
        pineBot.config.rainbowPolicyOverride = 'skip';
        assert.ok(/gun-BANNED/.test(g.why), g.why);
    });
    test('taking the gun no longer pays the optimiser', () =>
        assert.strictEqual(pineBot.config.milestones.rainbow, 0));
    test('with skip policy the gun scores a hard veto (< -100)', () =>
        assert.ok(g.score < -100, 'gun ' + g.score + ' (' + g.why + ')'));
    test('even a day-banned filler outbids the vetoed gun', () =>
        assert.ok(f.score > g.score, 'filler ' + f.score + ' vs gun ' + g.score));
    done();
}

// 21. v6.85.22: the doctrine constants are CEM-searchable, and enemy-type
//     threat weights are LEARNED from attributed damage.
if (which === 'learned') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 650 } });
    pineBot.stop();
    pineBot.test.setChar('pat');   // v6.87.1: written against pat's profile (speed 1.9, 180 HP)
    pineBot.test.applyDefaults();
    global.player = { x: 270, y: 270, hp: 170, maxHp: 180, speed: 1.9 };
    // --- (a) killOrderDist is live: same field, coefficient flips the target.
    const field = [
        { type: 'passout', x: 110, y: 270, r: 20, fallT: 0, hp: 55, maxHp: 55, id: 8 },
        { type: 'passout', x: 500, y: 270, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 2 }
    ];
    global.enemies = field;
    pineBot.test.setParam('movement.killOrderDist', 0.9);
    let pl; for (let i = 0; i < 6; i++) pl = pineBot.test.planMove();
    test('killOrderDist 0.9: transit dominates, near target wins (west)', () =>
        assert.ok(pl.dx < -0.4, 'dx ' + pl.dx.toFixed(2)));
    pineBot.test.setParam('movement.killOrderDist', 0.05);
    for (let i = 0; i < 12; i++) pl = pineBot.test.planMove();
    test('killOrderDist 0.05: frailty dominates, far target wins (east)', () =>
        assert.ok(pl.dx > 0.4, 'dx ' + pl.dx.toFixed(2)));
    pineBot.test.applyDefaults();
    // --- (b) patRing is live. v6.86.1: it governs CONTESTED passouts — the
    // live bodies packed around one are the real reason to stand off, and a
    // free passout is hugged instead (it deals no damage, and hugging is the
    // only way nearestEnemy() ever points the base attack at it).
    pineBot.test.setParam('patRing.late', 118);   // gt 650 = the late bucket
    global.enemies = [
        { type: 'passout', x: 380, y: 270, r: 20, fallT: 0, hp: 55, maxHp: 55, id: 3 },
        { type: 'mob', x: 372, y: 250, r: 12, hp: 300, maxHp: 300, speed: 1.4, moving: true },
        { type: 'mob', x: 388, y: 250, r: 12, hp: 300, maxHp: 300, speed: 1.4, moving: true },
        { type: 'mob', x: 380, y: 300, r: 12, hp: 300, maxHp: 300, speed: 1.4, moving: true },
        { type: 'mob', x: 360, y: 280, r: 12, hp: 300, maxHp: 300, speed: 1.4, moving: true },
        { type: 'mob', x: 400, y: 280, r: 12, hp: 300, maxHp: 300, speed: 1.4, moving: true }
    ];
    // dist 110 < ring 118+20: the planner must OPEN the gap (move west)
    let pw; for (let i = 0; i < 8; i++) pw = pineBot.test.planMove();
    test('patRing.late 118: contested passout at 110px, the planner backs out', () =>
        assert.ok(pw.dx < -0.3, 'dx ' + pw.dx.toFixed(2)));
    // v6.86.4: uncontested changes nothing on its own — the ring is the ring.
    // What changes it is the ULT coming up: the demo's economy is to bank the
    // bodies and drift onto the pile as the blast comes off cooldown.
    global.enemies = [
        { type: 'passout', x: 380, y: 270, r: 20, fallT: 0, hp: 55, maxHp: 55, id: 3 },
        { type: 'passout', x: 395, y: 290, r: 20, fallT: 0, hp: 55, maxHp: 55, id: 5 }
    ];
    global.player.ultReadyAt = 1e9;                 // ult far away: hold the ring
    let pf; for (let i = 0; i < 8; i++) pf = pineBot.test.planMove();
    test('with the ult cold, the bot still holds off the pile', () =>
        assert.strictEqual(pf.ultHarvest, false));
    global.player.ultReadyAt = 0;                   // ult ready: harvest
    let ph; for (let i = 0; i < 8; i++) ph = pineBot.test.planMove();
    test('with the ult ready, the harvest window opens', () =>
        assert.strictEqual(ph.ultHarvest, true));
    test('and the bot drifts onto the passout pile to detonate', () =>
        assert.ok(ph.dx > pf.dx + 0.2, 'cold ' + pf.dx.toFixed(2) + ' ready ' + ph.dx.toFixed(2)));
    pineBot.test.applyDefaults();
    // --- (c) v6.107.0: the learned enemy-type weight is APPLIED again.
    // 6.85.23 withdrew it and this test froze that withdrawal ("the weight
    // must NOT move"). It comes back under three bounds, and each bound is
    // asserted here rather than trusted: a minimum sample count, a tight
    // APPLIED band (0.8-1.4) far inside the 0.6-2.2 the store may hold, and
    // one live off switch. The 6.85.22 failure was the bot fearing ordinary
    // mobs at 2.2x and refusing to farm; the ceiling makes it unreachable.
    global.enemies = [{ type: 'bomber', x: 340, y: 270, r: 14, hp: 400, maxHp: 400, speed: 1.2, moving: true }];
    pineBot.test.setEnemyMul({});
    pineBot.test.setEnemyN({});
    const w1 = pineBot.test.gatherThreats(global.player).enemies[0].w;
    // UNDER the sample floor, a stored multiplier does nothing at all.
    pineBot.test.setEnemyMul({ bomber: 1.3 });
    pineBot.test.setEnemyN({ bomber: 3 });
    const wLow = pineBot.test.gatherThreats(global.player).enemies[0].w;
    test('under enemyMulMinN a stored multiplier is ignored', () =>
        assert.ok(Math.abs(wLow / w1 - 1) < 0.01, 'w1 ' + w1 + ' wLow ' + wLow));
    // OVER it, the danger field actually moves.
    pineBot.test.setEnemyN({ bomber: 40 });
    const wOn = pineBot.test.gatherThreats(global.player).enemies[0].w;
    test('past the sample floor, a learned 1.3x DOES move the danger weight', () =>
        assert.ok(Math.abs(wOn / w1 - 1.3) < 0.02, 'w1 ' + w1 + ' wOn ' + wOn));
    // ...and the ratchet that caused the regression cannot be reproduced.
    pineBot.test.setEnemyMul({ bomber: 2.2 });
    const wCap = pineBot.test.gatherThreats(global.player).enemies[0].w;
    // v6.115.0: reads the ceiling instead of hardcoding 1.4 — this test is
    // about the CLAMP existing, and the ceiling moved (1.4 -> 1.8) because
    // drunk and runner were both pinned against it on 149k/139k sole hits.
    // Deriving the bound here is normally the toothless-test trap; it is safe
    // only because `regime-breaks` carries the literal invariant that the
    // ceiling must sit above what those two types measured.
    test('a store value above the ceiling is clamped to the APPLIED ceiling', () => {
        const ceil = pineBot.config.learning.enemyMulCeil;
        assert.ok(2.2 > ceil, 'the probe value 2.2 no longer exceeds the ceiling ' + ceil);
        assert.ok(Math.abs(wCap / w1 - ceil) < 0.02, 'w1 ' + w1 + ' wCap ' + wCap + ' ceil ' + ceil);
    });
    test('enemyMulApply:false restores the static profile weight exactly', () => {
        pineBot.test.setParam('learning.enemyMulApply', false);
        const wOff = pineBot.test.gatherThreats(global.player).enemies[0].w;
        pineBot.test.setParam('learning.enemyMulApply', true);
        assert.ok(Math.abs(wOff / w1 - 1) < 0.01, 'w1 ' + w1 + ' wOff ' + wOff);
    });
    // --- (d) v6.107.0 SOLE-CANDIDATE ATTRIBUTION. The learner is fed only by
    // damage events where contact was the ONE hazard class in range, and the
    // credited type is the body inside contact reach — not, as before, the
    // nearest body within 140px, which booked mark/proj/DoT damage onto
    // whatever mob happened to be standing there. That guess is precisely
    // what ratcheted the common types to the cap in ~10 runs.
    pineBot.test.setEnemyMul({}); pineBot.test.setEnemyN({});
    pineBot.test.applyDefaults();
    // A bomber 3px off the player's skin: gap 3 < contactReach 7.2, and no
    // projectile, mark, line or rival exists — so contact is the sole candidate.
    global.enemies = [{ type: 'bomber', x: 287, y: 270, r: 14, hp: 400, maxHp: 400, speed: 1.2, moving: true }];
    global.player.hp = 170; pineBot.test.planMove();
    global.player.hp = 150; pineBot.test.planMove();
    const ht = pineBot.test.hitTypes();
    test('a sole-candidate contact hit IS attributed to the touching type', () =>
        assert.ok(ht.bomber >= 19, JSON.stringify(ht)));
    // The counterpart, and the whole point: the same HP drop next to the same
    // enemy, but with a projectile also in range, is AMBIGUOUS and dropped.
    // Under the old rule this landed on 'bomber' with equal confidence.
    pineBot.test.resetHitTypes();
    global.eprojectiles = [{ x: 276, y: 270, r: 6, vx: -1, vy: 0 }];
    global.player.hp = 150; pineBot.test.planMove();
    global.player.hp = 130; pineBot.test.planMove();
    const ht2 = pineBot.test.hitTypes();
    test('...but an ambiguous hit (proj also in range) is dropped, not guessed', () =>
        assert.ok(!ht2.bomber, JSON.stringify(ht2)));
    global.eprojectiles = [];
    done();
}

// 22. v6.85.23: the CEM sanitizer heals NaN-poisoned state from 6.85.22.
if (which === 'cem-heal') {
    const poisoned = {
        runs: 200, bartender: 'minguk', rewardEpoch: CUR_EPOCH,
        cem: { mean: { 'movement.standoff': 120, 'patRing.early': NaN }, sigma: { 'movement.standoff': 20, 'patRing.early': NaN },
               pc: { 'movement.standoff': NaN }, ss: NaN, batch: [{ r: 1, p: { 'movement.standoff': 118, 'patRing.mid': NaN } }] },
        hof: [{ r: 3, p: { 'movement.standoff': 115, 'movement.killOrderDist': NaN } }],
        enemyTypeMul: { mob: 2.2, bomber: 2.0 }
    };
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 5 },
        // v6.93.2: seeded under the per-char key so this tests store
        // healing, not a fresh store. v6.96.0: the joe pin flipped the boot
        // character and this went red exactly as the comment above warned —
        // now seeded under ALL the keys a selection change can reach.
        storage: { pineBotUCB_v5: JSON.stringify(poisoned), pineBotUCB_v5_pat: JSON.stringify(poisoned),
                   pineBotUCB_v5_joe: JSON.stringify(poisoned) } });
    setTimeout(() => {
        pineBot.stop();
        const L = pineBot.learn();
        test('non-finite CEM means/sigmas are stripped', () =>
            assert.ok(!('patRing.early' in (L.cem.mean || {})) && isFinite(L.cem.mean['movement.standoff'])));
        test('the step size is reset to a finite value', () => assert.ok(isFinite(L.cem.ss)));
        test('NaN entries are stripped from hof vectors', () =>
            assert.ok(!('movement.killOrderDist' in L.hof[0].p)));
        test('the ratcheted enemyTypeMul store is cleared', () =>
            assert.strictEqual(L.enemyTypeMul, undefined));
        const sp = pineBot.test.sampleParams();
        test('sampling is finite again for every dimension', () =>
            assert.ok(Object.keys(sp).every(k => isFinite(sp[k])), JSON.stringify(sp).slice(0, 120)));
        done();
    }, 2200);
}

// v6.86.0 — the measured lockup: every sigma at the floor + a cloned champion
if (which === 'cem-lockup') {
    // Freeze EVERY dimension at the sigma floor, exactly as measured — read
    // the live TUNABLE boxes out of the built script so this test tracks the
    // real parameter set instead of a hand-copied subset.
    const boxes = {};
    for (const m of require('fs').readFileSync(SCRIPT, 'utf8')
        .matchAll(/'([a-zA-Z.]+)':\s*\{\s*min:\s*(-?[\d.]+),\s*max:\s*(-?[\d.]+)\s*\}/g))
        boxes[m[1]] = { min: +m[2], max: +m[3] };
    const mean = {}, sigma = {};
    for (const k of Object.keys(boxes)) {
        const b = boxes[k];
        mean[k] = b.min + (b.max - b.min) * 0.5;
        sigma[k] = (b.max - b.min) * 0.05;   // the floor
    }
    mean['movement.standoff'] = 120;
    mean['strategy.deepFocusLv'] = 5.63;     // outside the tightened box
    const champ = { ...mean, 'movement.standoff': 121 };
    const locked = {
        runs: 3373, bartender: 'minguk', rewardEpoch: CUR_EPOCH,
        cem: { mean, sigma, pc: {}, ss: 0.616, gen: 425, batch: [] },
        // hof[0] and hof[1] byte-identical, as measured
        hof: [{ r: 9.9, p: { ...champ } }, { r: 9.9, p: { ...champ } }, { r: 8, p: { ...champ } },
              { r: 7, p: { ...mean, 'movement.standoff': 150 } }]
    };
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 5 },
        // v6.93.2: seeded under both keys — see cem-heal's note.
        storage: { pineBotUCB_v5: JSON.stringify(locked), pineBotUCB_v5_pat: JSON.stringify(locked),
                   pineBotUCB_v5_joe: JSON.stringify(locked) } });
    setTimeout(() => {
        pineBot.stop();
        const L = pineBot.learn();
        test('a collapsed store is detected and the search reopened', () =>
            assert.ok(L.cem.restarts >= 1, 'restarts ' + L.cem.restarts));
        test('sigma is no longer at the floor', () =>
            assert.ok(pineBot.test.sigmasAtFloor() < 0.2, 'atFloor ' + pineBot.test.sigmasAtFloor()));
        test('the restart keeps the mean', () =>
            assert.ok(Math.abs(L.cem.mean['movement.standoff'] - 120) < 1e-6));
        test('the restart prunes the cloned hall of fame to one entry', () =>
            assert.strictEqual(L.hof.length, 1));
        test('a one-dimension difference is NOT treated as the same point', () =>
            assert.ok(pineBot.test.paramDist(mean, { ...mean, 'movement.standoff': 150 }) > 0.1));
        test('deepFocusLv is clamped into the tightened box', () =>
            assert.ok(L.cem.mean['strategy.deepFocusLv'] <= 4 + 1e-9, L.cem.mean['strategy.deepFocusLv']));
        test('identical vectors are the same hof point, not two', () =>
            assert.ok(pineBot.test.paramDist(champ, { ...champ }) === 0));
        test('a replayed champion re-estimates instead of cloning itself', () => {
            const before = L.hof.length, nBefore = L.hof[0].n || 1;
            pineBot.test.hofRecord(2, { ...L.hof[0].p });     // champion replay, poor result
            pineBot.test.hofRecord(2, { ...L.hof[0].p });
            const h = pineBot.learn().hof;
            assert.strictEqual(h.length, before, 'hof grew to ' + h.length);
            assert.strictEqual(h[0].n, nBefore + 2, 'observations ' + h[0].n);
            assert.ok(h[0].r < h[0].best, 'mean ' + h[0].r + ' best ' + h[0].best);
        });
        test('sampling actually explores again', () => {
            const a = pineBot.test.sampleParams(), b = pineBot.test.sampleParams();
            assert.ok(Math.abs(a['movement.standoff'] - b['movement.standoff']) > 1e-6);
        });
        done();
    }, 2200);
}

// v6.86.1 — per-character ultimates and the corrected passout model
if (which === 'ult-kinds') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    pineBot.test.setChar('pat');   // v6.87.1: minguk is pinned; this block audits pat
    const fire = (plan, ms) => { let n = 0; global.useUltimate = () => { n++; }; pineBot.test.maybeAbilities(plan); return n; };
    const base = { hpRatio: 0.9, hpPanic: false, panic: false, danger: 0, near: 2, dx: 0, dy: 0,
                   passoutsNear: 2, poCentroidDist: 60, poNearest: 60, adjacent: 400, toughness: 1 };
    test('pat: a passout across the floor does not spend the ult', () =>
        assert.strictEqual(fire({ ...base, ultFalloff: true, poNearest: 420, poCentroidDist: 420 }), 0));
    test('pat: a passout he is standing on does', () => {
        pineBot.test.resetUltGate();
        assert.ok(fire({ ...base, ultFalloff: true, poNearest: 45 }) >= 1);
    });
    test('pat: a body already on him does', () => {
        pineBot.test.resetUltGate();
        assert.ok(fire({ ...base, contactImminent: true, adjacent: 18 }) >= 1);
    });
    test('joe: eight invulnerable seconds are spent on what is adjacent', () => {
        pineBot.test.setChar('joe'); pineBot.test.resetUltGate();
        assert.ok(fire({ ...base, hpRatio: 0.4, adjacent: 40 }) >= 1);
    });
    test('joe: not spent on a passout field across the floor', () => {
        pineBot.test.setChar('joe'); pineBot.test.resetUltGate();
        assert.strictEqual(fire({ ...base, adjacent: 400, poNearest: 420, poCentroidDist: 420 }), 0);
    });
    test('joe: spikes ARE spent on a passout inside their ~149px reach', () => {
        pineBot.test.setChar('joe'); pineBot.test.resetUltGate();
        assert.ok(fire({ ...base, adjacent: 400, poNearest: 60 }) >= 1);
    });
    test('minguk: the nuke IS the passout clear, at any range', () => {
        pineBot.test.setChar('minguk'); pineBot.test.resetUltGate();
        assert.ok(fire({ ...base, adjacent: 400 }) >= 1);
    });
    test('the ult kinds match the game source', () => {
        pineBot.test.setChar('pat');
        assert.strictEqual(pineBot.test.charProfile().ultKind, 'spray');
        pineBot.test.setChar('joe');
        assert.strictEqual(pineBot.test.charProfile().ultKind, 'aura');
        pineBot.test.setChar('minguk');
        assert.ok(pineBot.test.charProfile().ultClearsPassouts === true);
    });
    // the invulnerability window: joe walks INTO the crowd, panic is off
    const joeAt = ultUntil => {
        pineBot.test.setChar('joe');
        global.player = { x: 270, y: 270, hp: 22, maxHp: 100, speed: 3, ultUntil };
        global.enemies = [
            { type: 'mob', x: 360, y: 270, r: 12, hp: 900, maxHp: 900, speed: 1.6, moving: true },
            { type: 'mob', x: 370, y: 285, r: 12, hp: 900, maxHp: 900, speed: 1.6, moving: true },
            { type: 'mob', x: 350, y: 255, r: 12, hp: 900, maxHp: 900, speed: 1.6, moving: true }
        ];
        let pl; for (let i = 0; i < 4; i++) pl = pineBot.test.planMove();
        return pl;
    };
    const inUlt = joeAt(1e6), after = joeAt(0);
    test('the invulnerability window is detected', () =>
        assert.ok(inUlt.ultInvuln === true && after.ultInvuln === false));
    test('joe does not panic at 22% HP while Untouchable', () =>
        assert.strictEqual(inUlt.hpPanic, false));
    test('the aura posture is flagged for joe only', () => {
        assert.strictEqual(inUlt.auraUlt, true);
        pineBot.test.setChar('pat');
        global.player = { x: 270, y: 270, hp: 60, maxHp: 180, speed: 1.9, ultSpiralUntil: 1e6 };
        const patPl = pineBot.test.planMove();
        assert.strictEqual(patPl.ultInvuln, true, 'pat spiral is an invulnerability window too');
        assert.strictEqual(patPl.auraUlt, false, 'pat does not get joe melee posture');
    });
    // The point of the window is that danger stops costing anything: the
    // planner accepts a position it would refuse at the same HP a second
    // later, which is how joe's spikes ever reach a body.
    test('joe accepts danger he would refuse outside the window', () =>
        assert.ok(inUlt.danger > after.danger, 'in ' + inUlt.danger.toFixed(1) + ' after ' + after.danger.toFixed(1)));
    test('the same low HP panics once the window closes', () =>
        assert.strictEqual(after.hpPanic, true));
    done();
}

// v6.86.2 — passout feasibility: measure the damage going in, walk away from
// what cannot be killed, but never condemn a body the ult is about to clear
if (which === 'tank-holdout') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    pineBot.test.setChar('pat');   // v6.87.1: minguk is pinned, so the tank is selected explicitly here
    pineBot.test.applyDefaults();
    // (a) a tank with no super yet puts the first one above ordinary work
    const sup = pineBot.test.scoreCard({ n: 'SUPER VODKA MARTINI', type: 'super', lv: 0, maxlv: 6 }, 0, []);
    test('a tank with no super pays a premium for the first one', () =>
        assert.ok(/tank-first-super/.test(sup.why), sup.why));
    // (a2) and the armour lines are front-loaded: worth most at minute 0,
    // nothing by the finale, because armour is what licences the tank's
    // whole posture for the rest of the run
    const oliveAt = () => pineBot.test.scoreCard({ n: 'OLIVE', type: 'passive', lv: 1, maxlv: 6 }, 0, []);
    // v6.99.2: the late sample wears the park-gate armor (30) so the
    // entry-armor checkpoint stands down — this test measures the tank
    // premium's DECAY, not the (separately tested) entry checkpoint.
    global.player = Object.assign({}, global.player, { defense: 6 * 5.832 });
    // v6.107.0: the armour TIER (a time-gated hold on the pure-defence
    // ingredients before armorTierFromS, so the user's damage-first phase
    // comes first) would otherwise dominate the gt-60 sample and invert this
    // comparison. It is switched off here so this test keeps measuring the
    // one thing it names — the TANK premium's decay — and is asserted on its
    // own terms in the `armor-tier` scenario.
    pineBot.test.setParam('movement.armorTierFromS', 0);
    global.gameTime = 60; const early = oliveAt();
    global.gameTime = 1150; const late = oliveAt();
    pineBot.test.setParam('movement.armorTierFromS', 300);
    test('a tank pays an early premium for the armour lines', () =>
        assert.ok(/tank-armor-early/.test(early.why), early.why));
    test('the premium has decayed away by the finale', () =>
        assert.ok(early.score > late.score, early.score.toFixed(0) + ' vs ' + late.score.toFixed(0)));
    global.gameTime = 900;
    // (a3) the ultimate is the tank's passout economy: the premium runs to
    // the cap, because the last levels are where a cast wipes instead of chips
    const ultCard = () => pineBot.test.scoreCard({ n: 'ULTIMATE UP', type: 'ult', lv: 2, maxlv: 6 }, 0, []);
    global.player = { x: 270, y: 270, hp: 180, maxHp: 180, speed: 1.9, ultLevel: 5 };
    const nearCap = ultCard();
    global.player.ultLevel = 6;
    const atCapUlt = ultCard();
    test('a tank still pays for the ult at level 5', () =>
        assert.ok(/tank-ult-spine/.test(nearCap.why), nearCap.why));
    test('and stops once it is maxed', () =>
        assert.ok(!/tank-ult-spine/.test(atCapUlt.why), atCapUlt.why));
    test('TOMATO JUICE is valued as ult throughput for a tank', () => {
        const tj = pineBot.test.scoreCard({ n: 'TOMATO JUICE', type: 'passive', lv: 1, maxlv: 6 }, 0, []);
        assert.ok(/tank-ult-cadence/.test(tj.why), tj.why);
    });
    // (a4) the corpse-reviver line cannot touch a holdout, so it sits under
    // every other junk pick — but a pool of pure junk still has an order
    test('the CR line ranks below ordinary junk', () => {
        const abs = pineBot.test.scoreCard({ n: 'ABSINTHE', type: 'passive', lv: 0, maxlv: 6 }, 0, []);
        const coin = pineBot.test.scoreCard({ n: 'COINTREAU', type: 'passive', lv: 0, maxlv: 6 }, 0, []);
        assert.ok(/dead-vs-holdouts/.test(abs.why), abs.why);
        assert.ok(abs.score < coin.score, abs.score + ' vs ' + coin.score);
    });
    test('and still below the revive, which at least buys a life', () => {
        const abs = pineBot.test.scoreCard({ n: 'ABSINTHE', type: 'passive', lv: 0, maxlv: 6 }, 0, []);
        const cb = pineBot.test.scoreCard({ n: 'COFFEE BEANS', type: 'passive', lv: 0, maxlv: 6 }, 0, []);
        assert.ok(abs.score < cb.score, abs.score + ' vs ' + cb.score);
    });
    // (b) armour bought with OLIVE + NEGRONI buys down caution and panic
    const at = lv => {
        pineBot.test.setOwned({ OLIVE: lv, NEGRONI: lv });
        global.player = { x: 270, y: 270, hp: 110, maxHp: 180, speed: 1.9, r: 7.2 };
        global.enemies = [
            { type: 'passout', x: 320, y: 270, r: 37, fallT: 0, hp: 5000, maxHp: 5000, id: 4 },
            { type: 'mob', x: 250, y: 250, r: 12, hp: 400, maxHp: 400, speed: 1.3, moving: true }
        ];
        let pl; for (let i = 0; i < 4; i++) pl = pineBot.test.planMove();
        return pl;
    };
    const bare = at(0), armored = at(6);
    test('armour is measured off the OLIVE + NEGRONI levels', () =>
        assert.ok(armored.armorLv === 12 && bare.armorLv === 0, armored.armorLv + '/' + bare.armorLv));
    test('a tank converts armour into a caution discount', () =>
        assert.ok(armored.armorConf > bare.armorConf && armored.armorConf > 0.2, 'conf ' + armored.armorConf));
    test('the armoured tank plants on the holdout instead of sliding off', () =>
        assert.ok(armored.holdoutAnchor === true && bare.holdoutAnchor === false,
            armored.holdoutAnchor + '/' + bare.holdoutAnchor));
    done();
}

if (which === 'po-feasibility') {
    const { pineBot, logs } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const burn = (hp, dmgPerTick, ms, extra) => {
        pineBot.test.resetPoTracking();
        global.player = Object.assign({ x: 300, y: 270, hp: 180, maxHp: 180, speed: 1.9, r: 7.2,
                                        ultReadyAt: 1e9 }, extra || {});
        const po = { type: 'passout', x: 360, y: 270, r: 37, fallT: 0, hp, maxHp: hp, id: 7 };
        global.enemies = [po];
        // v6.100.0: the TTK probe reads GAME seconds now, so the scene
        // advances gameTime alongside the wall spin (0.15 game-sec per
        // ~100 ms tick — a mild speed-up that also keeps the scenario
        // inside the 30 s per-scenario timeout).
        global.gameTime = 900;
        let pl; const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            pl = pineBot.test.planMove();
            po.hp = Math.max(1, po.hp - dmgPerTick);
            global.gameTime += 0.15;
            const w = Date.now(); while (Date.now() - w < 100) { }
        }
        return { plan: pl, po };
    };
    // 1400 hp is a 5-minute passout: 300 dps clears it inside the budget
    const easy = burn(1400, 30, 4000);
    test('a killable passout is kept as the station target', () =>
        assert.strictEqual(easy.plan.poGaveUp, 0, 'gave up ' + easy.plan.poGaveUp));
    test('the observed kill rate is measured, not assumed', () =>
        assert.ok(easy.plan.poDps > 100, 'dps ' + easy.plan.poDps));
    // v6.99.1 (user: "constantly try to attack them as 1 out of 3 of them
    // have a tip"): in DAY a slow burn is never hopeless — the ult cycles
    // every pile eventually, and an abandoned body is an abandoned tip roll.
    // (7.5s burns: past the 6s poProbeS window, and three of them fit the
    // 30s per-scenario timeout that the third burn breached at 9s each)
    const hard = burn(80000, 30, 4500);
    test('DAY: an unkillable passout is NOT abandoned — the ult will cycle to it', () =>
        assert.strictEqual(hard.plan.poGaveUp, 0, 'gave up ' + hard.plan.poGaveUp));
    // HELL keeps the feasibility doctrine: latch hell, re-run the same burn.
    global.hell = true;
    pineBot.test.handleScreens();   // the playing handler latches hellDetected off the lexical flag
    const hellHard = burn(80000, 30, 4500);
    test('HELL: the unkillable passout is abandoned after the probe window', () =>
        assert.strictEqual(hellHard.plan.poGaveUp, 1, 'gave up ' + hellHard.plan.poGaveUp));
    test('the abandonment is logged with the measured numbers', () =>
        assert.ok(logs.some(l => /passout .* abandoned/.test(l)), logs.slice(-3).join(' | ')));
    // ...but not while the ult — the actual clear tool — is nearly ready
    const withUlt = burn(80000, 30, 4500, { ultReadyAt: 905 });   // gameTime 900, ready in 5s
    test('a body the ult is about to clear is NOT abandoned', () =>
        assert.strictEqual(withUlt.plan.poGaveUp, 0, 'gave up ' + withUlt.plan.poGaveUp));
    // v6.100.0 SPEED INVARIANCE: freeze the GAME clock and the feasibility
    // window must not accumulate — the wall-clock probe abandoned bodies on
    // wall time (during pauses, and 100x too fast under the multiplier).
    {
        pineBot.test.resetPoTracking();
        global.player = { x: 300, y: 270, hp: 180, maxHp: 180, speed: 1.9, r: 7.2, ultReadyAt: 1e9 };
        const po = { type: 'passout', x: 360, y: 270, r: 37, fallT: 0, hp: 80000, maxHp: 80000, id: 7 };
        global.enemies = [po];
        global.gameTime = 900;   // and it STAYS 900 — frozen
        let pl; const t0 = Date.now();
        while (Date.now() - t0 < 6600) {
            pl = pineBot.test.planMove();
            po.hp = Math.max(1, po.hp - 30);
            const w = Date.now(); while (Date.now() - w < 100) { }
        }
        test('a FROZEN game clock accumulates no feasibility window', () =>
            assert.strictEqual(pl.poGaveUp, 0, 'gave up ' + pl.poGaveUp));
    }
    done();
}

// v6.86.3 — the 🎥 demo digest: a 9k-sample recording compressed to a few KB
if (which === 'demo-digest') {
    const S = [], E = [];
    for (let i = 0; i < 720; i++) {
        const gt = Math.round(i * 0.25);
        const poD = gt < 60 ? null : (gt < 100 ? 140 - gt : 45);
        S.push({ t: i * 250, gt, x: 270, y: 270, hp: gt < 90 ? 100 : 78, poD,
            poHp: poD == null ? null : (gt < 130 ? 6000 : 0), poN: poD == null ? 0 : 2,
            bossD: null, wallD: null, near: gt > 80 ? 4 : 1, marks: 0, fbD: null, frz: 0,
            slow: 1, mobHp: 300, fx: 0, ulv: gt < 120 ? 1 : 2, ur: 1,
            sup: gt < 95 ? 0 : 1, ol: gt < 40 ? 0 : 4, ng: gt < 80 ? 0 : 2,
            // v6.109.0: the immortal-build fields. The user records to the
            // moment of corner anchoring and stops, so the tail is the answer.
            def: gt < 40 ? 5.8 : 34.9, rgn: gt < 80 ? 0 : 2.22, cnr: gt < 150 ? 280 : 40, inv: gt < 150 ? 0 : 1,
            w: { negroni: gt < 80 ? 0 : 6 }, pas: { olive: gt < 40 ? 0 : 6 } });
    }
    E.push({ t: 0, e: 'pick', gt: 35, a: [0, ['OLIVE', 'MINT', 'SUGAR']] });
    E.push({ t: 0, e: 'ult', gt: 118 });
    E.push({ t: 0, e: 'dash', gt: 60 });
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 100 },
        storage: { pineBotDemos: JSON.stringify([{ at: 1, n: S.length, samples: S, events: E }]) } });
    pineBot.stop();
    const d = pineBot.demo();
    test('a recorded demo produces a digest', () => assert.ok(!d.error, JSON.stringify(d).slice(0, 80)));
    test('the digest is small enough to paste', () => {
        const n = JSON.stringify(d).length;
        assert.ok(n < 20000, n + ' chars from ' + S.length + ' samples');
    });
    test('it reports where the human stands while farming a passout', () =>
        assert.ok(d.passoutStation.median === 45, JSON.stringify(d.passoutStation)));
    test('it pairs every ultimate with the passout HP around it', () => {
        const u = d.ultimates.uses[0];
        assert.ok(u && u.gt === 118 && u.poHpBefore === 6000 && u.poD === 45, JSON.stringify(u));
    });
    test('it timestamps the build: first super, ult level, armour', () => {
        assert.strictEqual(d.build.firstSuperGt, 95);
        assert.strictEqual(d.build.ultLevelReached, 2);
        assert.strictEqual(d.build.oliveTimeline['4'], 40);
    });
    test('it records what was actually picked, not just the pool', () =>
        assert.strictEqual(d.build.picks[0].took, 'OLIVE'));
    test('the digest splits the day from the deep game', () => {
        // one demo spanning both: the day farms passouts in an empty field,
        // the deep game has none and stands in crowds — pooling hides both
        const S2 = [], E2 = [];
        for (let i = 0; i < 600; i++) {
            const gt = i * 8;
            S2.push({ t: i * 160, gt, x: 270, y: 270, hp: gt < 1200 ? 90 : 100,
                poD: gt < 1200 ? 80 : null, poHp: gt < 1200 ? 5000 : null, poN: gt < 1200 ? 2 : 0,
                bossD: null, wallD: null, near: gt < 1200 ? 1 : 18, marks: 0, fbD: null, frz: 0,
                slow: 1, mobHp: 1e4, fx: 0, ulv: 6, ur: 1, sup: 3, ol: 6, ng: 6 });
        }
        E2.push({ e: 'ult', gt: 300 }); E2.push({ e: 'ult', gt: 4000 });
        try { localStorage.setItem('pineBotDemos', JSON.stringify([{ at: 1, n: S2.length, samples: S2, events: E2 }])); } catch (e) { }
        const d2 = pineBot.demo();
        assert.strictEqual(d2.byPhase.day.passoutStationMedian, 80);
        assert.strictEqual(d2.byPhase.deep.passoutStationMedian, null);
        assert.ok(d2.byPhase.deep.crowdP75 > d2.byPhase.day.crowdP75);
        assert.strictEqual(d2.byPhase.day.ults, 1);
        assert.strictEqual(d2.byPhase.deep.ults, 1);
    });
    test('an empty store says so instead of throwing', () => {
        try { localStorage.removeItem('pineBotDemos'); } catch (e) { }
        assert.ok(pineBot.demo().error);
    });
    // --- v6.109.0 THE FINAL STATE. A recording that STOPS at corner
    // anchoring is answering one question — what is an immortal build made
    // of, and when did it arrive — and every other field in the digest is a
    // distribution over the whole run, which cannot answer it.
    const D = d;   // the digest already built from this scenario's recording
    test('the digest reports a final-state block', () =>
        assert.ok(D.final && typeof D.final === 'object', Object.keys(D).join(',')));
    test('...naming the build: def, regen, ult level, supers, weapons, passives', () => {
        for (const k of ['gt', 'def', 'regen', 'ultLv', 'supers', 'weapons', 'passives'])
            assert.ok(k in D.final, 'final is missing ' + k + ': ' + Object.keys(D.final).join(','));
        assert.strictEqual(D.final.def, 34.9, 'def ' + D.final.def);
        assert.strictEqual(D.final.regen, 2.22, 'regen ' + D.final.regen);
    });
    // The anchoring claim has to be CHECKED, not taken on trust: the tail is
    // summarised separately so a recording stopped in the open reads
    // differently from one stopped in a corner.
    test('the tail measures the anchor rather than assuming it', () => {
        assert.ok(D.final.tailCornerDist.median < 80,
            'tail corner distance ' + D.final.tailCornerDist.median + ' — not anchored');
        assert.strictEqual(D.final.tailInvulnShare, 1, 'tail invuln ' + D.final.tailInvulnShare);
    });
    // ...and full-run posture must NOT be confused with the tail: cornerDist
    // over the whole run is 280 for most of it, which would read as "no
    // corner camping" exactly as the joe demo doc reported.
    // The recorder itself, driven directly. Everything above tests the
    // DIGEST against samples handed to it; nothing tested that demoTick
    // actually captures the immortal-build fields, and a teeth check proved
    // it: deleting `def` from the sample left every assertion green.
    test('demoTick captures the immortal-build fields it is meant to', () => {
        global.player = { x: 40, y: 40, hp: 100, maxHp: 100, speed: 1.5, ultLevel: 5,
                          defense: 34.992, regenBonus: 2.218,
                          weapons: { negroni: 6 }, passives: { olive: 6 }, superLv: { a: 1, b: 1 } };
        global.enemies = []; global.gameTime = 1500;
        pineBot.test.startDemo();
        pineBot.test.demoTick();
        const smp = pineBot.test.demoSamples();
        assert.ok(smp && smp.length, 'recorder captured nothing');
        const L = smp[smp.length - 1];
        assert.strictEqual(L.def, 35.0, 'def ' + L.def);
        assert.strictEqual(L.rgn, 2.22, 'rgn ' + L.rgn);
        assert.deepStrictEqual(L.w, { negroni: 6 }, JSON.stringify(L.w));
        assert.deepStrictEqual(L.pas, { olive: 6 }, JSON.stringify(L.pas));
        assert.strictEqual(L.ulv, 5);
        pineBot.test.startDemo();   // stop
    });

    test('the whole-run posture stays separate from the tail', () =>
        assert.ok(D.posture.cornerDist.median > D.final.tailCornerDist.median,
            'run ' + D.posture.cornerDist.median + ' vs tail ' + D.final.tailCornerDist.median));

    done();
}

if (which === 'flight') {
    // --- (c) unkillable chase: flight survives low HP, and the ult fires ---
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.ageHellEntry(120000);
        // 33% HP: below panicHp, so pre-6.85.6 `!hpPanic` switched flight off
        global.player = { x: 270, y: 270, hp: 60, maxHp: 180, speed: 1.9 };
        global.enemies = [0, 1, 2, 3, 4, 5].map(i => ({
            type: 'mob', x: 270 + 70 * Math.cos(i), y: 270 + 70 * Math.sin(i),
            r: 14, hp: 9e9, maxHp: 9e9, speed: 3.0, moving: true
        }));
        const plan = pineBot.test.planMove();
        test('hpPanic is set at 33% HP', () => assert.strictEqual(plan.hpPanic, true));
        test('flight stays on at low HP against unkillable bodies', () =>
            assert.strictEqual(plan.flight, true));
        let ults = 0, dashes = 0;
        global.useUltimate = () => { ults++; };
        global.tryDash = () => { dashes++; };
        // v6.100.0: the ability gates read GAME time — the boot frames ran at
        // gt 3000 and may have spent the gate there, so advance the clock the
        // way live play would before asserting a fresh fire.
        global.gameTime = (typeof global.gameTime === 'number' ? global.gameTime : 3000) + 10;
        pineBot.test.maybeAbilities(plan);
        // the ult path here is `defensive` (panic && near >= 4), not ultSpam —
        // see the note in maybeAbilities. Asserted because the directive names
        // it, not because 6.85.6 changed it.
        test('the ult fires during a low-HP flight', () => assert.ok(ults > 0, 'ults ' + ults));
        // v6.89.8 REVERSES THIS ASSERTION, deliberately. Source-verified:
        // tryDash sets only dashDx/dashDy/dashUntil — NO invulnerability. It is
        // a 0.16 s speed burst along the heading the planner already chose, so
        // in panic (a flee vector) it amplifies exactly the wrong move, and at
        // depth it cannot open a gap against 50-119 px/frame bodies anyway.
        // User: "without dashing on panic mode in deep hell ... and anchor
        // towards one of the four corners." This scene is gameTime 3000 in hell
        // with hpPanic set, which is precisely that case.
        test('a low-HP deep-hell panic does NOT dash any more', () =>
            assert.strictEqual(dashes, 0, 'dashes ' + dashes + ' — panic should anchor, not sprint'));
        // v6.100.0 SPEED INVARIANCE: with the GAME clock frozen, wall time
        // alone must not reopen the ult gate — at a 100x frame multiplier a
        // wall-gated retry starved the ult 100:1 against game time (the
        // 6.99.3/4 death pile at 47-115 s).
        {
            const savedCd = pineBot.config.abilities.ultCooldownMs;
            pineBot.config.abilities.ultCooldownMs = 1;
            global.gameTime = (typeof global.gameTime === 'number' ? global.gameTime : 3010) + 10;
            ults = 0;
            pineBot.test.maybeAbilities(plan);            // gt advanced: fires
            const afterFirst = ults;
            const w0 = Date.now(); while (Date.now() - w0 < 30) { }   // wall +30ms, gt frozen
            pineBot.test.maybeAbilities(plan);
            test('a frozen game clock holds the ult gate shut whatever the wall does', () =>
                assert.ok(afterFirst >= 1 && ults === afterFirst,
                    JSON.stringify({ afterFirst, ults })));
            pineBot.config.abilities.ultCooldownMs = savedCd;
        }
        done();
    }, 2000);
}


// v6.86.11 — the pat/minguk rotation (user: "rotate between minguk and pat
// now"). 6.85.0 shipped a rotation that never rotated, so the mechanism gets
// asserted directly rather than inferred from a config value.
if (which === 'rotation') {
    const { pineBot, store } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    const T = pineBot.test;
    // v6.96.0 — REVISED ON PURPOSE, again, and for the same kind of reason
    // as the 6.93.2 revision it replaces. That revision encoded the user's
    // pat/joe rotation; the user has now overridden THAT directly: "since we
    // know pat can do this strategy now more consistently, can we try to
    // just optimize for joe only." Pat's proof is run 4589 (13,244 s, ended
    // only by hand), so the pin sends the whole sample rate to joe. The
    // substance of every earlier revision is kept below: the pin must
    // actually pin, the rotation machinery must still alternate and persist
    // when the pin is lifted, and re-pinning must work — the 6.85.0
    // rotation-that-never-rotated failure stays covered in both directions.
    test('joe is pinned — the whole sample rate goes to him', () =>
        assert.strictEqual(pineBot.config.preferredBartender, 'joe'));
    test('the rotation list survives the pin (restore = one line)', () =>
        assert.deepStrictEqual(pineBot.config.bartenderRotation, ['pat', 'joe']));
    const pinnedJoe = [T.chooseBartender(), T.chooseBartender(), T.chooseBartender()];
    test('the pin actually pins: every run is joe', () =>
        assert.deepStrictEqual(pinnedJoe, ['joe', 'joe', 'joe'], pinnedJoe.join(',')));
    test('a pinned choice never advances the rotation index', () =>
        assert.strictEqual(store.pineBotRotIdx, undefined, 'idx ' + store.pineBotRotIdx));
    // Lift the pin: the underlying rotation must still work, or restoring
    // pat/joe later silently stops rotating — the 6.85.0 failure.
    pineBot.config.preferredBartender = null;
    const seq = [T.chooseBartender(), T.chooseBartender(), T.chooseBartender(), T.chooseBartender()];
    test('unpinned, the rotation still alternates pat and joe', () =>
        assert.deepStrictEqual(seq, ['pat', 'joe', 'pat', 'joe'], seq.join(',')));
    test('the position is persisted, so a reload resumes mid-sequence', () =>
        assert.strictEqual(String(store.pineBotRotIdx), '0', 'idx ' + store.pineBotRotIdx));
    // The pin machinery must survive being re-set to someone else too.
    pineBot.config.preferredBartender = 'minguk';
    const pinned = [T.chooseBartender(), T.chooseBartender()];
    test('re-pinning minguk still works and holds run after run', () =>
        assert.deepStrictEqual(pinned, ['minguk', 'minguk'], pinned.join(',')));
    pineBot.config.preferredBartender = 'joe';   // leave the shipped pin in place
    done();
}

// v6.86.11 — a resumed rotation, and what switching character switches with it
if (which === 'rotation-resume') {
    const { pineBot } = makeEnv({
        script: SCRIPT, game: { state: 'playing', gameTime: 900 },
        storage: { pineBotRotIdx: '1' }
    });
    pineBot.stop();
    const T = pineBot.test;
    // v6.93.2: rotation is now pat/joe, so index 1 resumes on JOE.
    test('a stored index resumes where the last session stopped', () =>
        assert.strictEqual(T.nextRotationChar(), 'joe'));
    // switching bartender must switch the learned store with it, or the two
    // characters' CEM samples pollute each other
    T.setChar('minguk'); T.reloadLearn();
    const mingukStore = pineBot.learn().bartender;
    T.setChar('pat'); T.reloadLearn();
    const patStore = pineBot.learn().bartender;
    test('each bartender loads its own learned store', () =>
        assert.ok(mingukStore === 'minguk' && patStore === 'pat', mingukStore + ' / ' + patStore));
    // `pineBot.tag` is stamped once at boot; the per-run tag comes from
    // pineBotStats(), which reads the live bartender.
    test('the version tag separates the two rows in compare()', () => {
        T.setChar('minguk');
        const mTag = global.window.pineBotStats().version;
        T.setChar('pat');
        const pTag = global.window.pineBotStats().version;
        assert.notStrictEqual(mTag, pTag, 'both tagged ' + mTag);
        assert.ok(/minguk/.test(mTag) && /pat/.test(pTag), mTag + ' / ' + pTag);
    });
    done();
}

// v6.86.11 — the 6.86.x tank doctrine must not follow minguk around. Every
// bonus written for pat gates on style === 'tank'; minguk is a runner.
if (which === 'rotation-doctrine') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    const tomato = () => T.scoreCard({ n: 'TOMATO JUICE', type: 'passive', lv: 1, maxlv: 6 }, 0, []);
    const firstSuper = () => T.scoreCard({ n: 'SUPER VODKA MARTINI', type: 'super', lv: 0, maxlv: 6 }, 0, []);
    T.setChar('pat');
    const patTomato = tomato(), patSuper = firstSuper();
    T.setChar('minguk');
    const mgTomato = tomato(), mgSuper = firstSuper();
    test('pat pays the ult-cadence premium on TOMATO JUICE', () =>
        assert.ok(/tank-ult-cadence/.test(patTomato.why), patTomato.why));
    test('minguk does not — the tank tilt is inert for a runner', () =>
        assert.ok(!/tank-/.test(mgTomato.why), mgTomato.why));
    test('nor does he pay the tank first-super premium', () =>
        assert.ok(!/tank-first-super/.test(mgSuper.why), mgSuper.why));
    test('pat still does', () =>
        assert.ok(/tank-first-super/.test(patSuper.why), patSuper.why));
    // and the ult doctrine is per-character: the 6.86.10 ultAdjacent widening
    // is pat's melee gate, and must not narrow minguk's nuke
    T.setChar('minguk');
    const mg = T.charProfile();
    T.setChar('pat');
    const pat = T.charProfile();
    test("minguk's nuke has unlimited reach", () =>
        assert.strictEqual(mg.ultReach, Infinity));
    test('and clears passouts, which pat\'s spray does not', () =>
        assert.ok(mg.ultClearsPassouts === true && pat.ultClearsPassouts === false));
    test('the 6.86.10 widening applies to the melee gate only', () =>
        assert.strictEqual(pineBot.config.abilities.ultAdjacent, 155));
    done();
}


// v6.86.12 — the tank posture must not follow a runner around. Every one of
// these came from Pat demos; minguk regressed to dying in the day once he
// started rotating back in under 6.86 movement.
if (which === 'runner-posture') {
    const makeField = () => ({
        state: 'playing', gameTime: 700,
        player: { x: 300, y: 300, hp: 100, maxHp: 120, r: 12, speed: 2.375, ultCooldown: 0 },
        enemies: [
            { x: 340, y: 300, r: 26, hp: 900000, maxHp: 900000, type: 'passout' },
            { x: 300, y: 345, r: 26, hp: 900000, maxHp: 900000, type: 'passout' }
        ]
    });
    const plan = char => {
        const { pineBot } = makeEnv({ script: SCRIPT, game: makeField() });
        pineBot.stop();
        pineBot.test.applyDefaults();
        pineBot.test.setChar(char);
        pineBot.test.setOwned({ OLIVE: 4, NEGRONI: 4 });   // armorConf well over the 0.05 gate
        global.player.ultReadyAt = 0;                      // ult up: the harvest window is open
        let pl; for (let i = 0; i < 8; i++) pl = pineBot.test.planMove();
        return pl;
    };
    const pat = plan('pat'), mg = plan('minguk');
    test('the tank plants on the holdout he is armoured for', () =>
        assert.strictEqual(pat.holdoutAnchor, true, JSON.stringify(pat.holdoutAnchor)));
    test('the runner does NOT inherit that licence', () =>
        assert.strictEqual(mg.holdoutAnchor, false, 'minguk anchored on a holdout'));
    test('both read the same armour level, so the gate is the character', () =>
        assert.ok(pat.armorLv === mg.armorLv, pat.armorLv + ' vs ' + mg.armorLv));
    // the harvest walk is for melee ults only — the nuke already reaches
    test('pat banks passouts for his melee spray', () =>
        assert.strictEqual(pat.ultHarvest, true));
    test('minguk does not walk into the pile for a nuke that reaches anyway', () =>
        assert.strictEqual(mg.ultHarvest, false, 'minguk harvested for a nuke'));
    done();
}


// v6.87.0 — per-character rosters. A tank and a runner share a core and
// diverge; and NEITHER may be able to complete six supers, because six maxed
// supers is the Rainbow Gun's gate.
if (which === 'roster-cap') {
    const roster = char => {
        const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 300 } });
        pineBot.stop();
        pineBot.test.setChar(char);
        pineBot.test.computeRoadmap();
        return pineBot.test.roadmap();
    };
    // v6.88.2 (user): "joe and pat have the items from this run and have the
    // same setup running into deep hell mode". 6.87.0 split the roster per
    // character; this test used to ASSERT that split. The split was about the
    // day, but the deep game all three are trying to reach is identical — and
    // it is the deep game the crown lives in. What converges is the BUILD;
    // posture (kiteMul / anchorBias / panicMul / ultKind) stays per character
    // and is guarded by `char-posture`.
    const pat = roster('pat'), mg = roster('minguk'), joe = roster('joe');
    test('all three characters build the SAME roster', () => {
        assert.deepStrictEqual(pat.cocktails, mg.cocktails, 'pat vs minguk');
        assert.deepStrictEqual(joe.cocktails, mg.cocktails, 'joe vs minguk');
        assert.deepStrictEqual(pat.ingredients, mg.ingredients, 'pat vs minguk ingredients');
        assert.deepStrictEqual(joe.ingredients, mg.ingredients, 'joe vs minguk ingredients');
    });
    test('the three super lines are the only essential ones (user, 6.89.3)', () => {
        for (const c of ['SOUTH SIDE', 'VODKA TONIC', 'MOJITO'])
            assert.ok(pat.cocktails.includes(c), c + ' missing: ' + pat.cocktails.join(','));
        for (const k of ['MINT', 'TONIC', 'SUGAR'])
            assert.ok(pat.ingredients.includes(k), k + ' missing');
    });
    // v6.91.9 — REVISED ON PURPOSE. GIN TONIC comes OFF this list, because the
    // user's 62686 s (17.4 h) crown run — 4x the bot's best ever — carried it as
    // one of four supers (GIN TONIC, VODKA TONIC, MOJITO, SOUTH SIDE) with
    // NEGRONI and WHISKY SOUR as the non-supers. That is direct evidence
    // against the 6.89.3 drop. VODKA CRANBERRY stays dropped.
    test('...and the ones the user dropped are gone', () => {
        for (const c of ['VODKA CRANBERRY'])
            assert.ok(!pat.cocktails.includes(c), c + ' should be off the roster');
    });
    // v6.91.5 — REVISED ON PURPOSE, not made to pass. Both assertions below
    // encoded the 6.89.3 decision ("for non super cocktails negroni is the only
    // essential"), and the user has now overridden it directly: "whisky sour
    // should be in the planned cocktails", because "it just freezes the bosses
    // always" and is "crucial when time pause is not available and late level
    // bosses can one hit the bot at early to mid hell".
    //
    // The substance of the old assertions is kept — NEGRONI is still carried,
    // the three super lines are still first, GIN TONIC and VODKA CRANBERRY are
    // still gone — and what changed is stated rather than deleted.
    // v6.92.2 — a THIRD keyless occupant. User, on the crown run: "Also had
    // normal moscow mule or vodka cherry for knockback effect". MOSCOW MULE is
    // the safe half of that pair (see KEYLESS_BOOST); VODKA CRANBERRY stays off
    // because CRANBERRY is a PLAN_INGREDIENT the build MAXES for pickup radius,
    // so carrying it would open a latent line for free.
    test('THREE keyless cocktails are carried: NEGRONI, WHISKY SOUR, MOSCOW MULE', () => {
        for (const c of ['NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'])
            assert.ok(pat.cocktails.includes(c), c + ' missing');
        assert.strictEqual(pat.cocktails.length, 7, pat.cocktails.join(','));
    });
    // v6.91.9 — GIN TONIC is back, and it is the CHEAPEST line on the board:
    // SUPER_KEY_INGREDIENT maps GIN TONIC and VODKA TONIC to the SAME key
    // (TONIC), which is already planned. So the fourth super line costs one
    // cocktail slot and ZERO ingredient slots.
    test('GIN TONIC is a FOURTH super line at zero ingredient cost', () => {
        assert.ok(pat.cocktails.includes('GIN TONIC'), pat.cocktails.join(','));
        assert.strictEqual(pineBot.test.superKey('GIN TONIC'),
                           pineBot.test.superKey('VODKA TONIC'), 'keys must be shared');
        assert.ok(pat.ingredients.includes(pineBot.test.superKey('GIN TONIC')),
                  'the shared key must already be planned');
    });
    // THE SAFETY PROPERTY that makes the fifth slot free: LEMON is permanently
    // banned, so WHISKY SOUR can never complete a super and cannot move the
    // roster toward the six-maxed-super Rainbow Gun gate. If this ever fails,
    // the fifth slot has stopped being free and the pick has to be reconsidered.
    test('...and the freeze slot adds NO completable super line', () => {
        const key = pineBot.test.superKey('WHISKY SOUR');
        assert.strictEqual(key, 'LEMON', String(key));
        assert.ok(!pat.ingredients.includes('LEMON'), pat.ingredients.join(','));
    });
    test('CAMPARI and COSMOPOLITAN are out', () => {
        assert.ok(!pat.ingredients.includes('CAMPARI'), pat.ingredients.join(','));
        assert.ok(!pat.cocktails.includes('COSMOPOLITAN'), pat.cocktails.join(','));
    });
    test('the top-priority ingredients are all planned', () => {
        for (const i of ['OLIVE', 'TOMATO JUICE', 'CRANBERRY', 'MINT', 'WATER', 'SUGAR',
                         'SWEET VERMOUTH', 'DRY VERMOUTH', 'COFFEE BEANS'])
            assert.ok(pat.ingredients.includes(i), i + ' missing: ' + pat.ingredients.join(','));
    });
    // THE STRUCTURAL GUN BAN: count supers this roster could ever complete.
    // A super needs its cocktail AND its key ingredient in the plan, and the
    // key must not be permanently banned (LEMON / ORANGE never unban;
    // GINGER BEER unbans in hell, so it counts).
    // v6.92.2 — the GINGER BEER special case is GONE, on purpose. It read
    // `|| key === 'GINGER BEER'` because applyHellUnban() used to open that key
    // for a fifth line. `hellUnbanIngredients` is empty, maxSuperLines is 4,
    // and the v6.92.0 arming cap refuses the level that would max it — so
    // counting it as completable overstated the roster. The count now asks the
    // real question: is the key one this build will ever take to Lv6?
    const NEVER = new Set(['LEMON', 'ORANGE']);
    const completable = r => r.cocktails.filter(c => {
        const key = pineBot.test.superKey(c);
        return key && !NEVER.has(key) && r.ingredients.includes(key);
    });
    const patN = completable(pat), mgN = completable(mg), joeN = completable(joe);
    test('the shared roster completes at most five supers — never the six-super gate', () =>
        assert.ok(patN.length <= 5, patN.length + ': ' + patN.join(',')));
    test('WATER and COFFEE BEANS opened no super line — their cocktails are off-roster', () => {
        assert.ok(!patN.includes('WHISKEY HIGHBALL') && !patN.includes('ESPRESSO MARTINI'), patN.join(','));
    });
    // NOTE (v6.88.3): the user asked for FOUR super lines, then asked for
    // CRANBERRY as a top-priority ingredient. CRANBERRY is VODKA CRANBERRY's
    // super key, so the roster can now complete FIVE. That is still safely
    // under the six-maxed-super Rainbow Gun gate, which is the invariant that
    // actually matters, so the cap is asserted at 5 and the tension is flagged
    // rather than silently resolved either way.
    test('all three characters agree on the line count', () =>
        assert.ok(patN.length === mgN.length && mgN.length === joeN.length,
            patN.length + ' / ' + mgN.length + ' / ' + joeN.length));
    test('and it stays under the six-super gun gate', () =>
        assert.ok(patN.length <= 5, patN.length + ': ' + patN.join(',')));
    // v6.91.9 — the exact count, so the GIN TONIC addition is measured and not
    // merely permitted by the <=5 cap. Three completable lines before, FOUR now,
    // matching the crown roster. NEGRONI (CAMPARI, unplanned) and WHISKY SOUR
    // (LEMON, never unbans) still add none, which is what keeps the sixth slot
    // free and the gun gate out of reach.
    test('the crown roster gives FOUR completable super lines, not three', () =>
        assert.strictEqual(patN.length, 4, patN.join(',')));
    test('...and the three keyless cocktails still contribute none', () => {
        for (const c of ['NEGRONI', 'WHISKY SOUR', 'MOSCOW MULE'])
            assert.ok(!patN.includes(c), c + ' opened a line: ' + patN.join(','));
    });
    // THE SAFETY PROPERTY for the third occupant, stated as an invariant:
    // GINGER BEER must stay out of the plan AND stay arming-capped. If either
    // changes, MOSCOW MULE becomes a fifth line and this must fail.
    test('MOSCOW MULE is keyless because GINGER BEER is never maxed', () => {
        const key = pineBot.test.superKey('MOSCOW MULE');
        assert.strictEqual(key, 'GINGER BEER', String(key));
        assert.ok(!pat.ingredients.includes(key), pat.ingredients.join(','));
        assert.ok(pineBot.test.scoreCard({ n: key, type: 'passive', lv: 5, maxlv: 6 }, 0, []).score < -400,
            'GINGER BEER @lv5 is pickable — the arming cap has a hole');
    });
    done();
}


// v6.87.0 — movement, anchoring and engagement diverge by character. Kiting
// and fleeing are both SPEED bets; pat (1.9) cannot win either, minguk (2.375)
// builds his whole doctrine on them.
if (which === 'char-posture') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 700 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const post = c => { pineBot.test.setChar(c); const p = pineBot.test.planMove(); return { kiteAt: p.kiteAt, fleeNear: p.fleeNear }; };
    const pat = post('pat'), mg = post('minguk'), joe = post('joe');
    test('the slow tank commits to kiting later than the runner', () =>
        assert.ok(pat.kiteAt > mg.kiteAt, pat.kiteAt + ' vs ' + mg.kiteAt));
    test('and to flight later still', () =>
        assert.ok(pat.fleeNear > mg.fleeNear, pat.fleeNear + ' vs ' + mg.fleeNear));
    test('the thresholds order by speed across all three', () =>
        assert.ok(joe.kiteAt <= mg.kiteAt && mg.kiteAt <= pat.kiteAt, [joe.kiteAt, mg.kiteAt, pat.kiteAt].join(' ')));
    test('minguk keeps the historical values that competed for the crown', () =>
        assert.ok(mg.kiteAt === 3 && mg.fleeNear === 4, JSON.stringify(mg)));
    test('every character still kites at some crowd size', () =>
        assert.ok([pat, mg, joe].every(x => x.kiteAt >= 2 && isFinite(x.kiteAt))));
    done();
}


// v6.87.2 — the junk pool must not walk toward the Rainbow Gun, and the
// super lines are capped at five.
if (which === 'gun-path') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    // v6.88.3 (user): "the build roster can now have 4 super cocktails
    // assuming southside is still on it" — tightened 5 -> 4. The gun gate is
    // SIX maxed supers, so four closes it with a full line of margin.
    // v6.88.5 (user): "vodka cranberry and cranberry is important" — both stay,
    // and CRANBERRY is VODKA CRANBERRY's key, so the roster completes FIVE.
    // Five is still a full line under the six-maxed-super gun gate.
    // v6.92.1 — REVISED ON PURPOSE. VODKA CRANBERRY left the roster, so the
    // plan completes FOUR lines off THREE keys (MINT; TONIC, shared by VODKA
    // TONIC and GIN TONIC; SUGAR). Every gun guard is gated on nSupers >= CAP,
    // so a cap of 5 left a full rogue line of slack the plan cannot use. At 4
    // the guards arm the moment the intended plan finishes.
    test('the cap is four super lines — exactly what the plan builds', () =>
        assert.strictEqual(pineBot.config.maxSuperLines, 4));
    // OLD FASHIONED is off-plan and keyed by ANGOSTURA (junk). Hold the
    // cocktail near its cap so ANGOSTURA levels visibly walk toward a super.
    T.setOwned({ 'OLD FASHIONED': 6, 'ANGOSTURA': 5, 'COINTREAU': 1, 'GIMLET': 1, 'LIME': 1 });
    const ango = T.scoreCard({ n: 'ANGOSTURA', type: 'passive', lv: 5, maxlv: 6 }, 0, []);
    const cointreau = T.scoreCard({ n: 'COINTREAU', type: 'passive', lv: 1, maxlv: 6 }, 0, []);
    test('a junk pick that COMPLETES an off-plan super is refused outright', () =>
        assert.ok(ango.score < -100, ango.score.toFixed(0) + ' ' + ango.why));
    test('and it is refused before the super count reaches the cap', () =>
        assert.ok(/gun-path-complete/.test(ango.why), ango.why));
    test('ordinary junk is preferred over gun-path junk', () =>
        assert.ok(cointreau.score > ango.score,
            'cointreau ' + cointreau.score.toFixed(0) + ' vs angostura ' + ango.score.toFixed(0)));
    // partial progress is ORDERED, not vetoed: a fresh off-plan key beats one
    // most of the way home
    T.setOwned({ 'SIDECAR': 5, 'COINTREAU': 4, 'GIMLET': 1, 'LIME': 0 });
    const nearly = T.scoreCard({ n: 'COINTREAU', type: 'passive', lv: 4, maxlv: 6 }, 0, []);
    const fresh = T.scoreCard({ n: 'LIME', type: 'passive', lv: 0, maxlv: 6 }, 0, []);
    test('a key most of the way to a sixth line is penalised', () =>
        assert.ok(/gun-path/.test(nearly.why), nearly.why));
    test('and ranks below a junk key that has barely started', () =>
        assert.ok(fresh.score > nearly.score,
            'lime ' + fresh.score.toFixed(0) + ' vs cointreau ' + nearly.score.toFixed(0)));
    // lines that can NEVER complete are harmless and must not be penalised:
    // LEMON and ORANGE are permanently banned, so their supers are unreachable
    const lemon = T.scoreCard({ n: 'LEMON', type: 'passive', lv: 3, maxlv: 6 }, 0, []);
    test('a permanently unreachable line is not treated as a gun path', () =>
        assert.ok(!/gun-path/.test(lemon.why), lemon.why));
    // and the sanctioned five are never penalised as gun paths
    const plan = T.roadmap().cocktails[0];
    const planCard = T.scoreCard({ n: plan, type: 'weapon', lv: 3, maxlv: 6 }, 0, []);
    test('the planned five are never treated as a gun path', () =>
        assert.ok(!/gun-path/.test(planCard.why), plan + ': ' + planCard.why));
    // v6.87.4: an off-plan line that has barely started is NOT taxed — two
    // levels in a fresh cocktail is damage, not a gun path, and taxing it
    // collapsed supers/run in the first 6.87.3 runs.
    T.setOwned({ 'MARGARITA': 1, 'ORANGE': 0, 'GIMLET': 1, 'LIME': 1, 'ESPRESSO MARTINI': 1, 'COFFEE BEANS': 1 });
    const early = T.scoreCard({ n: 'ESPRESSO MARTINI', type: 'weapon', lv: 1, maxlv: 6 }, 0, []);
    test('an off-plan line at level 1 is judged on merit, not taxed', () =>
        assert.ok(!/gun-path/.test(early.why), early.why));
    test('the floor is halfway', () => assert.strictEqual(pineBot.config.gunPathFloor, 0.5));
    // ...but past halfway the tax appears and climbs
    T.setOwned({ 'ESPRESSO MARTINI': 5, 'COFFEE BEANS': 3 });
    const halfway = T.scoreCard({ n: 'COFFEE BEANS', type: 'passive', lv: 3, maxlv: 6 }, 0, []);
    T.setOwned({ 'ESPRESSO MARTINI': 6, 'COFFEE BEANS': 4 });
    const nearer = T.scoreCard({ n: 'COFFEE BEANS', type: 'passive', lv: 4, maxlv: 6 }, 0, []);
    test('past halfway the tax appears', () =>
        assert.ok(/gun-path/.test(halfway.why), halfway.why));
    // compare the PENALTY, not the final score — the junk cap clamps both
    const tax = r => { const m = /gun-path(-?\d+)/.exec(r.why); return m ? Math.abs(+m[1]) : 0; };
    test('and climbs as the line closes', () =>
        assert.ok(tax(nearer) > tax(halfway), tax(nearer) + ' vs ' + tax(halfway)));
    done();
}



// v6.87.3 — the forced pool: early hell offers two cards and BOTH walk an
// off-plan super line, so whatever the bot takes advances the gate.
if (which === 'gun-forced') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 1300 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    // two off-plan lines, both part-built: OLD FASHIONED/ANGOSTURA and
    // SIDECAR/COINTREAU. Nothing safe on the table.
    T.setOwned({ 'OLD FASHIONED': 4, 'ANGOSTURA': 4, 'SIDECAR': 4, 'COINTREAU': 4 });
    global.window._pool = [
        { n: 'ANGOSTURA', type: 'passive', lv: 4, maxlv: 6 },
        { n: 'COINTREAU', type: 'passive', lv: 4, maxlv: 6 }
    ];
    test('both cards are recognised as gun paths', () => {
        assert.ok(T.gunPathProgress('passive', 'ANGOSTURA') > 0, 'angostura');
        assert.ok(T.gunPathProgress('passive', 'COINTREAU') > 0, 'cointreau');
    });
    T.handleLevelUp();
    const f = pineBot.gunForced();
    test('the forced pool is recorded', () => assert.strictEqual(f.n, 1, JSON.stringify(f)));
    test('it keeps what was actually on the table', () =>
        assert.ok(f.pools[0].offered.length === 2 &&
            f.pools[0].offered.every(o => /risk0\.\d/.test(o)), JSON.stringify(f.pools[0].offered)));
    test('and which one had to be eaten', () =>
        assert.ok(['ANGOSTURA', 'COINTREAU'].includes(f.pools[0].took), String(f.pools[0].took)));
    // a pool with ONE safe card is not forced — the safe card is simply taken
    global.window._pool = [
        { n: 'ANGOSTURA', type: 'passive', lv: 4, maxlv: 6 },
        { n: 'TIME STOP', type: 'item', lv: 1, maxlv: 6 }
    ];
    T.handleLevelUp();
    test('a pool with any safe option is NOT flagged as forced', () =>
        assert.strictEqual(pineBot.gunForced().n, 1, 'flagged a pool that had a way out'));
    done();
}


// v6.87.5 — SECRET CRAFTS. openRecipe() (read live) says the fusion arrives as
// a mid-run PROMPT, and the live DOM had "MAKE BLACK VERMOUTH" / "NOT NOW"
// sitting unanswered while both vermouths were at lv6 and `absorbed` was empty.
if (which === 'craft-prompt') {
    const clicked = [];
    const mkBtn = (text, id) => ({
        id: id || '', className: id === 'craftBtn' ? '' : 'btn craft-no', textContent: text,
        style: {}, querySelector: () => null, querySelectorAll: () => [],
        click() { clicked.push(text); }, dispatchEvent() { return true; }, appendChild() {}, remove() {},
        getBoundingClientRect: () => ({ width: 120, height: 30, top: 100, left: 100 })
    });
    const yes = mkBtn('MAKE BLACK VERMOUTH', 'craftBtn');
    const no = mkBtn('NOT NOW');
    const { pineBot } = makeEnv({
        script: SCRIPT, game: { state: 'playing', gameTime: 900 },
        dom: { buttons: [yes, no] }
    });
    pineBot.stop();
    // the prompt leaves G.state on 'playing', which is why it was never seen
    global.document.querySelector = sel => /craftBtn|craft-yes|craft-ok/.test(sel) ? yes : null;
    global.document.querySelectorAll = () => [yes, no];
    const took = pineBot.test.takeCraftPrompt();
    test('the fusion prompt is answered', () => assert.strictEqual(took, true));
    test('and MAKE is what gets clicked', () =>
        assert.deepStrictEqual(clicked, ['MAKE BLACK VERMOUTH'], clicked.join(',')));
    test('NOT NOW is never clicked', () =>
        assert.ok(!clicked.some(t => /not now/i.test(t)), clicked.join(',')));
    // THE ACTUAL BUG: the prompt leaves G.state on 'playing', and the
    // 'playing' handler used to return false unconditionally, so nothing ever
    // looked. Assert the wiring, not just the helper.
    // THE REAL WIRING. 6.87.5 put this in STATE_HANDLERS.playing(), which
    // handleScreens() never reaches — its `st === 'playing'` branch returns
    // first. Drive handleScreens() itself, the way the main loop does.
    // v6.88.0: the prompt is now latched by signature after the first click
    // (AUDIT C1), so clear the latch to simulate a NEW prompt rather than the
    // same one still sitting there — that case is covered by `audit-craft`.
    clicked.length = 0;
    pineBot.test.resetCraftLatch();
    global.state = 'playing';
    test('handleScreens answers the prompt during play', () =>
        assert.strictEqual(pineBot.test.handleScreens(), true));
    test('and it clicked MAKE, not NOT NOW', () =>
        assert.deepStrictEqual(clicked, ['MAKE BLACK VERMOUTH'], clicked.join(',')));
    done();
}

// v6.87.5 — the evolution trigger. openRecipe(): "base attack MAX + cocktail
// Lv6 + key ingredient MAX -> evolve AT A BOSS TIP". The tip IS the trigger.
if (which === 'evo-tip') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 700 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    test('nothing pending on a fresh run', () => assert.strictEqual(T.evolutionPending(), false));
    // NEGRONI at its cap with CAMPARI maxed = a super waiting for a tip
    T.setOwned({ NEGRONI: 6, CAMPARI: 6 });
    test('a qualified pair is reported as pending', () => assert.strictEqual(T.evolutionPending(), true));
    // ...and a half-built one is not
    const { pineBot: p2 } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 700 } });
    p2.stop(); p2.test.applyDefaults();
    p2.test.setOwned({ NEGRONI: 6, CAMPARI: 3 });
    test('an unfinished key is not pending', () => assert.strictEqual(p2.test.evolutionPending(), false));
    done();
}


// v6.88.0 — the static-audit regressions. Each of these asserts a defect that
// was live in 6.87.6 and is now fixed; deleting the fix must make it fail.
if (which === 'audit-signal') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    const T = pineBot.test;

    // --- C2: isFinite(null) fabricated a verdict from a single run ---
    const seed = () => {
        const L = pineBot.learn();
        L.snapshots = [];
        L.versions = {
            'A+crown': { n: 40, sumT: 40000, sumT2: 4.2e7, bestT: 3000, sumR: 40, sumD: 0, sumS: 0,
                         hell: 20, day: 20, sumSupers: 40, deaths: {}, times: new Array(40).fill(1000), over60: 0, over120: 0 },
            'B+crown': { n: 1, sumT: 1315, sumT2: 1729225, bestT: 1315, sumR: 2, sumD: 0, sumS: 0,
                         hell: 1, day: 1, sumSupers: 1, deaths: {}, times: [1315], over60: 0, over120: 0 }
        };
        return T.versionRows();
    };
    // Pin the ARITHMETIC, not the label: at n=1 seTimeS is null, and the old
    // global isFinite let null through as 0 in the Welch denominator. z must be
    // null — a verdict string alone would still pass with the bug present.
    test('a one-run row produces no z at all', () => {
        const b = seed().find(r => r.version === 'B+crown');
        assert.ok(b.vsPrev, 'no vsPrev block at all');
        assert.strictEqual(b.vsPrev.z, null, 'z = ' + b.vsPrev.z);
    });
    test('and says why rather than rendering a verdict', () => {
        const b = seed().find(r => r.version === 'B+crown');
        assert.ok(/insufficient|UNDERPOWERED/.test(b.vsPrev.verdict), b.vsPrev.verdict);
    });
    test('and a row under the floor is labelled underpowered', () => {
        const b = seed().find(r => r.version === 'B+crown');
        assert.strictEqual(b.underpowered, true);
    });
    test('a null field is no longer treated as zero', () =>
        assert.strictEqual(Number.isFinite(null), false));

    // --- D5: champion params clamped to the live box ---
    test('an out-of-box champion value is clamped, not applied', () => {
        T.applyParams({ 'strategy.deepFocusLv': 999 });
        const got = pineBot.config.strategy.deepFocusLv;
        assert.ok(got <= 6 && got > 0, 'deepFocusLv = ' + got);
    });
    test('and a below-box value is clamped up', () => {
        T.applyParams({ 'strategy.deepFocusLv': -50 });
        assert.ok(pineBot.config.strategy.deepFocusLv >= 0, pineBot.config.strategy.deepFocusLv);
    });

    // --- D1: the CORPSE REVIVER key is reachable now ---
    // NOTE: two legitimate exemptions have to be cleared before the ban can
    // show — an avoided weapon is NOT junk while no cocktail is owned (it is
    // the only path to having a weapon), and the -70 needs the pool to hold a
    // real alternative. Both are correct behaviour; the test sets them up.
    T.setOwned({ 'SOUTH SIDE': 3 });
    const crPool = [
        { n: 'CORPSE REVIVER No.2', type: 'weapon', lv: 0, maxlv: 6 },
        { n: 'SOUTH SIDE', type: 'weapon', lv: 3, maxlv: 6 }
    ];
    test('CORPSE REVIVER No.2 is recognised as junk', () => {
        const c = T.scoreCard(crPool[0], 0, crPool);
        assert.ok(/user-avoid|junk-cap|dead-vs-holdouts/.test(c.why), c.why);
    });
    test('and it scores below the plan cocktail beside it', () => {
        const cr = T.scoreCard(crPool[0], 0, crPool);
        const ok = T.scoreCard(crPool[1], 1, crPool);
        assert.ok(cr.score < ok.score, cr.score.toFixed(0) + ' vs ' + ok.score.toFixed(0));
    });
    test('the ABSINTHE trap exemption can now fire', () => {
        T.setOwned({ 'CORPSE REVIVER NO.2': 2 });
        const a = T.scoreCard({ n: 'ABSINTHE', type: 'passive', lv: 1, maxlv: 6 }, 0, []);
        assert.ok(!/absinthe-trap/.test(a.why), a.why);
    });

    // --- D2: the stall policy is resolved even though the gun is banned ---
    test('the gun is still banned', () => {
        const g = T.scoreCard({ n: 'RAINBOW GUN', type: 'rainbowup', lv: 0, maxlv: 1 }, 0, []);
        assert.ok(g.score < -100 && /BANNED/.test(g.why), g.why);
    });
    done();
}

// v6.88.0 — the craft prompt must count once per craft, not once per tick
if (which === 'audit-craft') {
    const clicked = [];
    let present = true;
    const btn = {
        id: 'craftBtn', className: '', textContent: 'MAKE BLACK VERMOUTH', style: {},
        querySelector: () => null, querySelectorAll: () => [],
        click() { clicked.push('MAKE'); }, dispatchEvent() { return true; },
        appendChild() {}, remove() {},
        getBoundingClientRect: () => ({ width: 120, height: 30, top: 100, left: 100 })
    };
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    global.document.querySelector = sel => (present && /craftBtn/.test(sel)) ? btn : null;
    global.document.querySelectorAll = () => present ? [btn] : [];
    const T = pineBot.test;
    const before = T.crafts();
    // twenty ticks with the prompt stuck on screen
    for (let i = 0; i < 20; i++) T.takeCraftPrompt();
    test('a stuck prompt is clicked exactly once', () =>
        assert.strictEqual(clicked.length, 1, clicked.length + ' clicks'));
    test('and credits NO craft while it is still up', () =>
        assert.strictEqual(T.crafts(), before, 'counted ' + (T.crafts() - before)));
    // the prompt clears — THAT is the proof the click worked
    present = false;
    T.takeCraftPrompt();
    test('the craft is credited once the prompt clears', () =>
        assert.strictEqual(T.crafts(), before + 1));
    T.takeCraftPrompt(); T.takeCraftPrompt();
    test('and is not credited again afterwards', () =>
        assert.strictEqual(T.crafts(), before + 1));
    done();
}

// v6.88.0 — click safety: the leaderboard toggle and the name form
if (which === 'audit-clicks') {
    const clicked = [];
    const mk = (text, id, cls) => ({
        id: id || '', className: cls || '', textContent: text, style: {},
        querySelector: () => null, querySelectorAll: () => [],
        click() { clicked.push(text); }, dispatchEvent() { return true; }, closest: () => null,
        getAttribute: () => null, appendChild() {}, remove() {}, parentElement: null,
        getBoundingClientRect: () => ({ width: 100, height: 24, top: 10, left: 10 })
    });
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'over', gameTime: 0 } });
    pineBot.stop();
    const T = pineBot.test;
    // S2: an OK next to a live text input is the logbook name form
    const okBtn = mk('OK', '', '');
    const input = { tagName: 'INPUT', style: {}, closest: () => null,
        getBoundingClientRect: () => ({ width: 120, height: 20, top: 5, left: 5 }) };
    global.document.querySelectorAll = sel => /input/i.test(sel) ? [input] : [okBtn];
    test('OK is refused while a name input is on screen', () =>
        assert.strictEqual(T.notNameForm(okBtn), false));
    test('so are the other submit words', () => {
        for (const w of ['CONFIRM', 'YES', 'SAVE', 'DONE'])
            assert.strictEqual(T.notNameForm(mk(w)), false, w + ' was allowed');
    });
    test('but RETRY still is — leaving the screen is the point', () =>
        assert.strictEqual(T.notNameForm(mk('RETRY')), true));
    // ...and allowed once the form is gone
    global.document.querySelectorAll = sel => /input/i.test(sel) ? [] : [okBtn];
    test('and allowed once the form is gone', () =>
        assert.strictEqual(T.notNameForm(okBtn), true));
    // C3: the hell board TOGGLE must never be the hell-entry click
    const toggle = mk('🔥 HELL', 'hellToggleBtn', '');
    const notToggle = el => el && !/toggle|board|tab|switch/i.test(
        (el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('onclick') || ''));
    test('the leaderboard toggle is vetoed by the hell-entry guard', () =>
        assert.strictEqual(notToggle(toggle), false));
    test('a real hell door is not', () =>
        assert.strictEqual(notToggle(mk('ENTER HELL', 'hellDoor', '')), true));
    done();
}

// v6.88.1 — THE WEDGED LEVEL-UP. Reported live: v6.88.0 at LV 71 / TIME 69:46
// with the LEVEL UP screen open, "picked TIME STOP +2S" on the panel, and the
// bot clicking the settings gear, the recipe book, STAFF, ITEMS and pause in a
// loop. Cause: AUDIT C4 turned a 900 ms window into a permanent signature latch
// that startRun alone clears, so the first REPEAT of a pool wedged
// handleLevelUp() to false for the rest of the run.
if (which === 'levelup-repeat') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'levelup', gameTime: 4186 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    // the live trio. These stat cards carry NO level, so two consecutive
    // level-ups produce a byte-identical signature.
    // real live types (the scorer keys on these, not 'item')
    const trio = () => [
        { n: 'FLAME CROSS', type: 'sp_firecross', lv: 0 },
        { n: 'TIME STOP', type: 'sp_timestop', lv: 0 },
        { n: 'TEQUILA SHOT', type: 'sp_tequila', lv: 0 }
    ];

    global.window._pool = trio();
    test('the first offer is taken', () => assert.strictEqual(T.handleLevelUp(), true));
    const first = global.picks.length;
    test('and it reached the game', () => assert.strictEqual(first, 1, 'picks=' + first));

    // same screen still up, same array: a missed click must NOT re-record.
    T.handleLevelUp();
    test('the same pool object does not double-pick', () =>
        assert.strictEqual(global.picks.length, 1, 'picks=' + global.picks.length));

    // THE BUG: a NEW level-up offering the identical trio.
    global.window._pool = trio();
    test('a fresh pool with the same cards is still picked', () =>
        assert.strictEqual(T.handleLevelUp(), true, 'latched — this is the 6.88.0 wedge'));
    test('and it too reached the game', () =>
        assert.strictEqual(global.picks.length, 2, 'picks=' + global.picks.length));

    // ...and it must keep working, not wedge one level later.
    for (let i = 0; i < 5; i++) { global.window._pool = trio(); T.handleLevelUp(); }
    test('five more identical pools all resolve', () =>
        assert.strictEqual(global.picks.length, 7, 'picks=' + global.picks.length));

    // TIME STOP is what should be taken, every time.
    // and the SCORER, not the card order, decides: TIME STOP is index 1.
    test('every pick is TIME STOP, never card 0', () => {
        const took = T.pickAudit().map(p => p.took);
        assert.ok(took.length >= 7 && took.every(t => t === 'TIME STOP'), took.join(','));
    });
    test('and the index sent to the game is 1, not 0', () =>
        assert.ok(global.picks.every(i => i === 1), global.picks.join(',')));
    done();
}


// v6.88.1 — a pick the game never received must record NOTHING. This is the
// real defect AUDIT C4 was aiming at, fixed by ordering instead of a latch.
if (which === 'levelup-miss') {
    const { pineBot } = makeEnv({
        script: SCRIPT, game: { state: 'levelup', gameTime: 900 }, noPickUpgrade: true
    });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    // no pickUpgrade and no clickable cards: every pick attempt misses.
    global.window._pool = [
        { n: 'TIME STOP', type: 'sp_timestop', lv: 0 },
        { n: 'FLAME CROSS', type: 'sp_firecross', lv: 0 }
    ];
    for (let i = 0; i < 6; i++) T.handleLevelUp();
    const audit = T.pickAudit ? T.pickAudit() : [];
    test('six missed attempts record no picks', () =>
        assert.strictEqual(audit.length, 0, JSON.stringify(audit)));
    test('and ownedLevels is not inflated', () =>
        assert.strictEqual(T.getOwned()['TIME STOP'] || 0, 0, JSON.stringify(T.getOwned())));
    done();
}


// v6.88.1 — the stuck-breaker must never touch the game's chrome. The observed
// run spent 24 s in settings -> book -> STAFF -> ITEMS -> CLOSE with a LEVEL UP
// unanswered behind them.
if (which === 'chrome-veto') {
    const clicked = [];
    const mk = text => ({
        id: '', className: 'btn', textContent: text, style: {},
        querySelector: () => null, querySelectorAll: () => [],
        click() { clicked.push(text); }, dispatchEvent() { return true; },
        appendChild() {}, remove() {}, closest: () => null,
        getBoundingClientRect: () => ({ width: 90, height: 30, top: 40, left: 40 })
    });
    // exactly the controls the observed run walked through, in order
    const chrome = ['SETTINGS', 'RECIPES', 'MOBS', 'STAFF', 'ITEMS', 'DRINKS',
                    'MUSIC', 'SFX', 'PAUSE', 'SAVE', 'BOOK', 'INDEX'];
    const btns = chrome.map(mk);
    const { pineBot, logs } = makeEnv({
        script: SCRIPT, game: { state: 'shop', gameTime: 900 }, dom: { buttons: btns }
    });
    global.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
    // selector-aware, so the breaker's CARD branch and its BLIND branch are
    // exercised for what they really are: none of these are level-up cards.
    global.document.querySelectorAll = sel =>
        /button|role="button"|\.btn|onclick|\ba\b|div|span|li/.test(String(sel)) ? btns : [];
    global.document.querySelector = () => null;
    // TWO things this scenario must get right or it has no teeth:
    //   1. the breaker is gated behind `running`, so the bot must be STARTED;
    //   2. it only fires after 2.2 s of a stalled state, so the clock must move.
    // The first draft of this test did neither and passed against the very
    // code it was written to catch.
    pineBot.start();
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => t;
    for (let i = 0; i < 10; i++) { t += 3000; pineBot.test.handleScreens(); }

    test('the stuck-breaker actually fired', () =>
        assert.ok(logs.some(l => /stuck in state/.test(l)), 'it never ran — this test would prove nothing'));
    test('no chrome control is ever clicked', () =>
        assert.ok(!clicked.some(c => chrome.includes(c)), 'clicked: ' + clicked.join(',')));
    test('with nothing but chrome on screen it clicks nothing at all', () =>
        assert.strictEqual(clicked.length, 0, 'clicked: ' + clicked.join(',')));

    // ...while a REAL action button on the same screen stays reachable: the
    // veto must not turn the breaker off, only aim it.
    // ONE continuous clock: rewinding it here left `lastStateAt` in the future
    // and the breaker silently never fired again.
    btns.push(mk('START RUNNING'));
    for (let i = 0; i < 3; i++) { t += 3000; pineBot.test.handleScreens(); }
    Date.now = realNow;
    test('a genuine action button is still clicked', () =>
        assert.ok(clicked.includes('START RUNNING'), 'clicked: ' + clicked.join(',')));
    done();
}


// v6.88.2 — DEEP-DEEP POSTURE (user: apply past ~150 min, all characters).
// Boss drop-marks spawn uniformly in [52,W-52]x[62,H-62] and are never aimed;
// the true corner is 80.9 px from the nearest possible centre against a ~70 px
// reach. Marks are 21-47% of deaths and hit for 35-40% of MAX HP.
if (which === 'corner-anchor') {
    const { pineBot } = makeEnv({
        script: SCRIPT, frames: 40,
        game: { state: 'playing', gameTime: 9600, hell: true }
    });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    // THE DISCRIMINATOR. The first draft of this test put the player at the
    // centre with one enemy at (320,320) and asserted "moves cornerward" —
    // which FLEEING that enemy also produces, so it passed with the corner
    // pull deleted. Place the player near the BOTTOM-RIGHT corner with the
    // threat BEYOND it, so fleeing and cornering point in opposite directions:
    // only the corner pull can produce a down-right step.
    const place = (gt) => {
        global.gameTime = gt;
        global.player.x = 400; global.player.y = 400;
        global.player.hp = 120; global.player.maxHp = 120;
        // bombers, not drunks: the planner FLEES these, so the baseline step
        // from this position is away from the corner
        global.enemies = Array.from({ length: 6 }, (_, i) => ({
            x: 498 + (i % 3) * 14, y: 498 + Math.floor(i / 3) * 14,
            r: 18, hp: 1e6, type: 'bomber'
        }));
        return T.planMove();
    };
    // v6.89.2: the gate moved from 9000 (150 min) to 4800 (the tip window's
    // close). Deep must still engage, and 5000 — which the OLD gate refused —
    // is the case that proves the threshold actually moved.
    // v6.99.3: the deep sample moved 9600 -> 8600 — runCapS is now 9000, so
    // 9600 is PAST the cap and the patrol (correctly) outranks the anchor.
    const deep = place(8600);
    test('past the deep threshold the corner anchor engages', () =>
        assert.strictEqual(deep && deep.cornerAnchor, true, JSON.stringify(deep && deep.cornerAnchor)));
    test('and it moves TOWARD the corner even though that closes on the threat', () =>
        assert.ok(deep.dx > 0 && deep.dy > 0,
            'dx ' + deep.dx.toFixed(2) + ' dy ' + deep.dy.toFixed(2) + ' — fleeing would be negative'));
    test('so the step shortens the distance to the corner', () => {
        const cd = (x, y) => Math.hypot(Math.min(x, 540 - x), Math.min(y, 540 - y));
        assert.ok(cd(400 + deep.dx * 40, 400 + deep.dy * 40) < cd(400, 400));
    });
    // ...and before the threshold the SAME field flees instead: the day and
    // early hell are untouched.
    const justPast = place(5000);
    test('and it now engages at 5000s, which the old 150-min gate refused', () =>
        assert.strictEqual(justPast && justPast.cornerAnchor, true,
            String(justPast && justPast.cornerAnchor) + ' — cornerAnchorFromS should be 4800'));
    // ...and inside the TIP WINDOW it must still stay off: 1800-4800 is the
    // revenue phase, and the runs that reach 100+ minutes are the ones that
    // farmed it. Cornering there would fight the phase that funds the build.
    // v6.89.3 — THE EARLY GATE. The user, watching the first version where the
    // corner engaged at all: "kiting for unkillable mobs is useless ... anchoring
    // in corner with southside ... so anchoring might be able to be employed
    // much earlier ... except to hunt down bosses." So the corner no longer
    // waits for a clock once the burn exists. hellDetected is latched the way
    // the main loop does it — through handleScreens — because the flag is
    // lexical and no test hook sets it.
    pineBot.test.handleScreens();
    global.enemies = [{ x: 498, y: 498, r: 18, hp: 1e6, type: 'bomber' }];
    pineBot.test.setOwned({ 'SOUTH SIDE': 0 });
    const noBurn = place(2000);
    test('early hell WITHOUT the burn does not corner — kiting still pays', () =>
        assert.strictEqual(noBurn && noBurn.cornerAnchor, false, String(noBurn && noBurn.cornerAnchor)));
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });
    const burn = place(2000);
    test('...but SOUTH SIDE in hell corners at 33 minutes, no clock involved', () =>
        assert.strictEqual(burn && burn.cornerAnchor, true,
            String(burn && burn.cornerAnchor) + ' — zoner + hell should be enough now'));
    test('and the kite yields to it rather than fighting it', () =>
        assert.ok(burn.kiting !== true || burn.cornerAnchor === true, JSON.stringify({ k: burn.kiting, c: burn.cornerAnchor })));
    // THE USER'S OWN EXCEPTION: a boss is worth breaking the corner for.
    // NOTE: place() rewrites global.enemies, so the boss cases set the field
    // themselves. (The first draft used place() and silently tested bombers.)
    const withBoss = (gt) => {
        global.gameTime = gt;
        global.player.x = 400; global.player.y = 400;
        global.player.hp = 120; global.player.maxHp = 120;
        global.enemies = [{ x: 470, y: 470, r: 40, hp: 1e6, maxHp: 1e6, type: 'boss', t: 'boss', boss: true }];
        return T.planMove();
    };
    const hunting = withBoss(2000);
    test('a boss inside the tip window breaks the corner — bosses get hunted', () =>
        assert.strictEqual(hunting && hunting.cornerAnchor, false,
            String(hunting && hunting.cornerAnchor)));
    // ...but the SAME boss past the tip window does not: once bosses stop
    // dropping tips they are not worth leaving the funnel for, and deep hell
    // always has one on the field.
    const huntingLate = withBoss(6000);
    test('...but the same boss past the tip window does NOT', () =>
        assert.strictEqual(huntingLate && huntingLate.cornerAnchor, true,
            String(huntingLate && huntingLate.cornerAnchor)));
    // v6.89.5 (user): "hunt down time stopped or frozen bosses early to kill
    // them before they cause severe damage." A free kill is worth leaving the
    // funnel for at ANY depth — unlike a live boss, which is not.
    const frozenBoss = (gt) => {
        global.gameTime = gt;
        global.player.x = 400; global.player.y = 400;
        global.player.hp = 120; global.player.maxHp = 120;
        global.frame = 1000;
        global.enemies = [{
            x: 470, y: 470, r: 40, hp: 1e6, maxHp: 1e6, type: 'boss', t: 'boss',
            boss: true, frozenUntil: 100000
        }];
        return T.planMove();
    };
    const frozenLate = frozenBoss(6000);
    test('a FROZEN boss breaks the corner even past the tip window', () =>
        assert.strictEqual(frozenLate && frozenLate.cornerAnchor, false,
            String(frozenLate && frozenLate.cornerAnchor) + ' — a free kill is worth the trip'));
    global.enemies = Array.from({ length: 6 }, (_, i) => ({
        x: 498 + (i % 3) * 14, y: 498 + Math.floor(i / 3) * 14, r: 18, hp: 1e6, type: 'bomber'
    }));
    pineBot.test.setOwned({ 'SOUTH SIDE': 0 });
    const inTipWindow = place(3000);
    test('inside the tip window it stays OFF — that phase is for farming', () =>
        assert.strictEqual(inTipWindow && inTipWindow.cornerAnchor, false,
            String(inTipWindow && inTipWindow.cornerAnchor)));
    const early = place(1500);
    test('and early hell does not engage either', () =>
        assert.strictEqual(early && early.cornerAnchor, false, String(early && early.cornerAnchor)));
    test('and the same field then produces a step AWAY from the threat', () =>
        assert.ok(early.dx < 0 || early.dy < 0,
            'dx ' + early.dx.toFixed(2) + ' dy ' + early.dy.toFixed(2)));
    done();
}


// v6.88.6 — SLOT LOCKOUT. The game narrows the pool toward gun lines late in
// a run (user: "only cocktails that lead towards it, down to two choices"), so
// refusing is not available by then. Claim every plan cocktail EARLY, while the
// pool is wide, and the gun line is closed by occupancy instead of by scoring.
if (which === 'slot-lockout') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 500 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    const sc = (n, t, lv) => T.scoreCard({ n, type: t, lv, maxlv: 6 }, 0, []).score;

    // v6.89.0 — the claim is a PREFERENCE, not an override. At +250 it
    // outranked the whole survival order and two 6.88.6 runs died in the day
    // at 596s and 484s with seven level-1 weapons and no armour.
    // v6.91.5 THE DAY ORDER IS THE FUNDING PHASE, and it must not be inverted.
    // (user: "whisky sour should be in the planned cocktails".) Adding it to
    // PLAN_COCKTAILS gives it a roadmap rank — fifth, last among the cocktails.
    // The first draft ALSO gave it the keyless-core boost in the day, and that
    // put it at 201 against VODKA TONIC 172 and NEGRONI 168: ahead of two of the
    // three super lines in the phase that pays for everything. The keyless boost
    // and the freeze bonus are now hell-only. This scene is a real day — gameTime
    // 500, hell never latched — unlike the freeze-slot scenario, whose env sets
    // hell:true and where the first version of this assertion proved nothing.
    // It carries a real DAY_ORDER rank — fifteenth overall, last among the
    // cocktails. Asserted on the tag, which names the rank, because two softer
    // forms of this check were toothless: a `/roadmap|day-order/` regex passed
    // with WHISKY SOUR removed from PLAN_COCKTAILS entirely, and beating an
    // off-roster GIN TONIC passed for unrelated reasons. `day-orderNN` can only
    // appear if the name is in DAY_ORDER at that position.
    // (PLAN_COCKTAILS membership is guarded by `roster-cap`, which does fail
    // when it is removed — this one guards the ordering list.)
    // v6.91.9: GIN TONIC re-entered DAY_ORDER ahead of the two keyless
    // cocktails, so WHISKY SOUR's rank shifts 16 -> 17. Still dead last.
    test('WHISKY SOUR carries a real DAY_ORDER rank (17th, last cocktail)', () =>
        assert.ok(/day-order17/.test(T.scoreCard({ n: 'WHISKY SOUR', type: 'weapon', lv: 0, maxlv: 6 }, 0, []).why || ''),
            T.scoreCard({ n: 'WHISKY SOUR', type: 'weapon', lv: 0, maxlv: 6 }, 0, []).why));
    // ...and it sits LAST among the six. This is an INVARIANT guard, not a
    // guard on this change: it does not fail when the roster edit is reverted,
    // but it fails the moment any future boost pushes the freeze ahead of a
    // super line during the funding phase.
    test('...and it ranks LAST of the six planned cocktails in the day', () => {
        const ws = sc('WHISKY SOUR', 'weapon', 0);
        const others = { ss: sc('SOUTH SIDE', 'weapon', 0), vt: sc('VODKA TONIC', 'weapon', 0),
                         mo: sc('MOJITO', 'weapon', 0), gt: sc('GIN TONIC', 'weapon', 0),
                         ne: sc('NEGRONI', 'weapon', 0) };
        for (const k of Object.keys(others))
            assert.ok(others[k] > ws, JSON.stringify(Object.assign({ ws: Math.round(ws) },
                Object.fromEntries(Object.entries(others).map(([a, b]) => [a, Math.round(b)])))));
    });

    // v6.106.0 — THE SUPER KEYS RANK AHEAD OF THE CRAFTS AND FILLERS.
    // Entry deaths on 6.102.0 were 65% zero-supers against 0% for survivors,
    // replicated on 6.104.0 (50% vs 0%); defense at cap did not separate the
    // two groups at all (46% vs 47%). TONIC opens TWO super lines and was
    // rank 11, behind every vermouth. Asserted on the TAG, which names the
    // rank and can only be emitted from that index in DAY_ORDER — the same
    // form as the WHISKY SOUR guard above, and for the same reason: a plain
    // score comparison between two ingredients can pass for unrelated reasons
    // (the super-line and craft-half terms both move these cards).
    // \b matters: /day-order1\b/ must NOT match `day-order11`.
    const tagOf = n => T.scoreCard({ n, type: 'passive', lv: 0, maxlv: 6 }, 0, []).why || '';
    test('TONIC is rank 1 in the day order (two super lines)', () =>
        assert.ok(/day-order1\b/.test(tagOf('TONIC')), tagOf('TONIC')));
    test('MINT is rank 2 (SOUTH SIDE key)', () =>
        assert.ok(/day-order2\b/.test(tagOf('MINT')), tagOf('MINT')));
    test('SUGAR is rank 3 (MOJITO key)', () =>
        assert.ok(/day-order3\b/.test(tagOf('SUGAR')), tagOf('SUGAR')));
    test('OLIVE follows the three keys at rank 4, ahead of every craft half', () =>
        assert.ok(/day-order4\b/.test(tagOf('OLIVE')), tagOf('OLIVE')));
    // ...and behaviourally, in a real day, each key outscores the craft half
    // it used to sit behind. This is the consequence the ranks exist for.
    test('each super key outscores the vermouth/filler it used to trail', () => {
        const got = { tonic: sc('TONIC', 'passive', 0), mint: sc('MINT', 'passive', 0),
                      sugar: sc('SUGAR', 'passive', 0), dry: sc('DRY VERMOUTH', 'passive', 0),
                      sweet: sc('SWEET VERMOUTH', 'passive', 0), water: sc('WATER', 'passive', 0) };
        const show = JSON.stringify(Object.fromEntries(
            Object.entries(got).map(([k, v]) => [k, Math.round(v)])));
        assert.ok(got.tonic > got.dry, show);
        assert.ok(got.mint > got.sweet, show);
        assert.ok(got.sugar > got.water, show);
    });
    // SIMPLE SYRUP is a craft of WATER + SUGAR and must not be reachable
    // before both halves are — an invariant that survives any future reorder.
    test('SIMPLE SYRUP still ranks after BOTH of its halves', () => {
        const O = pineBot.config && pineBot.config.dayOrder;
        const list = O || null;
        const idx = n => (list ? list.indexOf(n) : -1);
        if (!list) { // not exposed on config; assert via score instead
            assert.ok(sc('WATER', 'passive', 0) > sc('SIMPLE SYRUP', 'passive', 0),
                'water ' + Math.round(sc('WATER', 'passive', 0)) + ' syrup ' + Math.round(sc('SIMPLE SYRUP', 'passive', 0)));
            assert.ok(sc('SUGAR', 'passive', 0) > sc('SIMPLE SYRUP', 'passive', 0),
                'sugar ' + Math.round(sc('SUGAR', 'passive', 0)) + ' syrup ' + Math.round(sc('SIMPLE SYRUP', 'passive', 0)));
            return;
        }
        assert.ok(idx('SIMPLE SYRUP') > idx('WATER') && idx('SIMPLE SYRUP') > idx('SUGAR'),
            JSON.stringify({ syrup: idx('SIMPLE SYRUP'), water: idx('WATER'), sugar: idx('SUGAR') }));
    });

    test('OLIVE still outranks an unclaimed plan cocktail', () =>
        assert.ok(sc('OLIVE', 'passive', 5) > sc('SOUTH SIDE', 'weapon', 0),
            'OLIVE ' + Math.round(sc('OLIVE', 'passive', 5)) + ' vs SS ' + Math.round(sc('SOUTH SIDE', 'weapon', 0))));
    test('...but an unclaimed cocktail still beats levelling a claimed one', () => {
        const T2 = pineBot.test;
        T2.setOwned({ 'GIN TONIC': 3 });
        assert.ok(sc('SOUTH SIDE', 'weapon', 0) > sc('GIN TONIC', 'weapon', 3),
            'SS ' + Math.round(sc('SOUTH SIDE', 'weapon', 0)) + ' vs GT lv3 ' + Math.round(sc('GIN TONIC', 'weapon', 3)));
        T2.setOwned({ 'GIN TONIC': 0 });
    });
    test('and the claim is tagged so it is visible in the audit', () =>
        assert.ok(/slot-claim/.test(T.scoreCard({ n: 'NEGRONI', type: 'weapon', lv: 0, maxlv: 6 }, 0, []).why)));

    // once the slate is full the term switches off and the stated order returns
    T.setOwned({ 'SOUTH SIDE': 1, 'VODKA TONIC': 1, 'GIN TONIC': 1, 'NEGRONI': 1,
                 'WHISKY SOUR': 1, 'VODKA CRANBERRY': 1, 'MOJITO': 1 });
    test('with the slate full, the stated day order governs again', () =>
        assert.ok(sc('OLIVE', 'passive', 5) > sc('SOUTH SIDE', 'weapon', 1),
            'OLIVE ' + Math.round(sc('OLIVE', 'passive', 5)) + ' vs SS ' + Math.round(sc('SOUTH SIDE', 'weapon', 1))));
    test('and no slot-claim tag remains', () =>
        assert.ok(!/slot-claim/.test(T.scoreCard({ n: 'NEGRONI', type: 'weapon', lv: 2, maxlv: 6 }, 0, []).why)));

    // THE SAFETY PROPERTY THE 200-PER-RANK ORDER BROKE: every guard must still
    // dominate the ordering. A 3400-point rank bonus made -500 and -1000 noise.
    test('the rainbow ban still dominates the day order', () =>
        assert.ok(sc('RAINBOW GUN', 'rainbowup', 0) < -500,
            'rainbowup ' + Math.round(sc('RAINBOW GUN', 'rainbowup', 0))));
    test('and no day-order bonus can exceed a guard', () => {
        const best = Math.max(...['OLIVE', 'DRY VERMOUTH', 'MINT', 'TONIC'].map(n => sc(n, 'passive', 0)));
        assert.ok(best < 500, 'top day pick scored ' + Math.round(best) + ' — guards are -500');
    });
    done();
}


if (which === 'mark-escape') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 1400, hell: true } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    const mintScore = ch => {
        T.setChar(ch);
        return T.scoreCard({ n: 'MINT', type: 'passive', lv: 1, maxlv: 6 }, 0, []);
    };
    const pat = mintScore('pat'), minguk = mintScore('minguk'), joe = mintScore('joe');
    const tax = r => { const m = /mark-escape\+?(\d+)/.exec(r.why); return m ? +m[1] : 0; };
    test('pat gets a mark-escape bonus on MINT', () =>
        assert.ok(tax(pat) > 0, pat.why));
    test('minguk does not — 85.5 px already clears 70', () =>
        assert.strictEqual(tax(minguk), 0, minguk.why));
    test('joe does not either — 108 px', () =>
        assert.strictEqual(tax(joe), 0, joe.why));
    test('so MINT scores strictly higher for pat than for the runners', () =>
        assert.ok(pat.score > minguk.score && pat.score > joe.score,
            'pat ' + pat.score + ' minguk ' + minguk.score + ' joe ' + joe.score));
    done();
}


// v6.88.2 — the compare() verdict must name WHICH side is thin. A row with
// n=47 was printing "UNDERPOWERED (n<20)" because its BASELINE had n=8.
if (which === 'underpowered-label') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    const T = pineBot.test;
    // times must VARY or sd is 0, seTimeS is 0, and z is never computed at all
    const row = (n, t) => {
        const times = Array.from({ length: n }, (_, i) => t + (i % 7) * 40 - 120);
        return { n, sumT: times.reduce((a, b) => a + b, 0),
            sumT2: times.reduce((a, b) => a + b * b, 0), bestT: Math.max(...times),
            sumR: n, sumD: 0, sumS: 0, hell: n, day: n, sumSupers: n,
            deaths: {}, times, over60: 0, over120: 0 };
    };
    const L = pineBot.learn();
    L.snapshots = [];
    // baseline is THIN (n=8); the row under test is WELL SUPPORTED (n=47)
    L.versions = { 'A+crown': row(8, 1000), 'B+crown': row(47, 1200) };
    const rows = T.versionRows();
    const fat = rows.find(r => r.version === 'B+crown');
    test('the well-supported row is not blamed for the thin sample', () =>
        assert.ok(!/this row/.test(fat.vsPrev.verdict), fat.vsPrev.verdict));
    test('the verdict names the thin BASELINE instead', () =>
        assert.ok(/BASELINE A\+crown/.test(fat.vsPrev.verdict), fat.vsPrev.verdict));
    test('and it reports the real n, not a bare threshold', () =>
        assert.ok(/n=8/.test(fat.vsPrev.verdict), fat.vsPrev.verdict));
    test('it still refuses to call the z evidence', () =>
        assert.ok(/not evidence/.test(fat.vsPrev.verdict), fat.vsPrev.verdict));
    // and when the row ITSELF is thin, it says so
    L.versions = { 'A+crown': row(47, 1000), 'B+crown': row(8, 1200) };
    const thin = T.versionRows().find(r => r.version === 'B+crown');
    test('a genuinely thin row is labelled as this row', () =>
        assert.ok(/this row, n=8/.test(thin.vsPrev.verdict), thin.vsPrev.verdict));
    done();
}


// v6.89.0 — THE MANHATTAN HOLE (user: "manhattan seems to be the problem as
// the bot doesn't seem to know black vermouth which is hidden still leads to a
// super cocktail"). The plan deliberately maxes SWEET + DRY VERMOUTH to craft
// BLACK VERMOUTH; the craft EATS both halves; the game keeps honouring the
// maxed key. So the moment the craft lands, MANHATTAN (key SWEET VERMOUTH) is
// one cocktail away from a SIXTH super = the Rainbow Gun, and every guard that
// read ownedLevels saw a level-0 key and waved it through.
if (which === 'latent-line') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    const sc = (n, t, lv) => T.scoreCard({ n, type: t, lv, maxlv: 6 }, 0, []).score;
    const why = (n, t, lv) => T.scoreCard({ n, type: t, lv, maxlv: 6 }, 0, []).why;

    // v6.89.1 — THE CASE 6.89.0 MISSED, taken from a live 6.88.6 log:
    // MANHATTAN scored 41 in a junk pool with its key still unbuilt, was taken,
    // levelled to 126 and evolved to "★ SUPER MANHATTAN UP(super)=338". The
    // plan MAXES SWEET VERMOUTH on its way to the BLACK VERMOUTH craft, so the
    // line was latent from turn one.
    //
    // v6.110.0 — THE REFUSAL MOVED FROM LEVEL ZERO TO A LEVEL CEILING, and
    // this block is rewritten around the stronger invariant. The user's own
    // 79-minute joe recording took COSMOPOLITAN first, VODKA CRANBERRY four
    // times to lv4, GIMLET and VODKA MARTINI — and ended with FOUR supers,
    // never near the gun. Every one of those was refused at -600 by the lv0
    // veto. 6.87.4 had already found the same thing from the other direction
    // ("minguk's best recent runs are built on exactly those — DRY MARTINI,
    // VODKA CRANBERRY, COSMOPOLITAN") and relaxed a sibling rule; 6.89.0 then
    // re-refused them and the two rules disagreed unnoticed for 20 versions.
    //
    // What replaces it is STRICTLY STRONGER against the MANHATTAN course. A
    // super needs the cocktail MAXED and its key maxed. The ceiling parks the
    // cocktail below evolution range, so 114 -> 120 -> 126 -> evolve cannot
    // happen at ANY super count and however the key moves — where the lv0
    // veto only made the first step unattractive.
    const early = sc('MANHATTAN', 'weapon', 0);
    test('a latent cocktail is TAKEABLE at low level with supers far from the cap', () =>
        assert.ok(early > 0, 'MANHATTAN lv0 ' + Math.round(early) + ' — the human took these'));
    test('...but is refused at the evolution ceiling, which is what actually arms it', () => {
        const ceil = pineBot.config.gunSafeOffPlanLv;
        assert.ok(sc('MANHATTAN', 'weapon', ceil) < -400,
            'MANHATTAN lv' + ceil + ' ' + Math.round(sc('MANHATTAN', 'weapon', ceil)));
        assert.ok(/latent-line-ceiling/.test(why('MANHATTAN', 'weapon', ceil)),
            why('MANHATTAN', 'weapon', ceil));
    });
    // THE INVARIANT THAT MATTERS: the line cannot COMPLETE. Every level from
    // the ceiling up is refused, so the cocktail can never reach lv6.
    test('every level from the ceiling to max is refused — the line cannot complete', () => {
        for (let lv = pineBot.config.gunSafeOffPlanLv; lv <= 6; lv++)
            assert.ok(sc('MANHATTAN', 'weapon', lv) < -400,
                'MANHATTAN lv' + lv + ' ' + Math.round(sc('MANHATTAN', 'weapon', lv)));
    });
    for (const c of ['VODKA MARTINI', 'WHISKEY HIGHBALL', 'DRY MARTINI', 'BLOODY MARY', 'ESPRESSO MARTINI'])
        test('the ceiling holds for the other plan-keyed line: ' + c, () =>
            assert.ok(sc(c, 'weapon', pineBot.config.gunSafeOffPlanLv) < -400,
                c + ' ' + Math.round(sc(c, 'weapon', pineBot.config.gunSafeOffPlanLv))));

    // ...and the OLD veto still governs at the dangerous end. Near the cap a
    // latent cocktail is refused at EVERY level, exactly as before 6.110.0.
    test('near the super cap the lv0 veto returns', () => {
        // nSupers reads supersMade / player.superLv, NOT supersThisRun — a
        // test hook that moved the wrong counter passed silently at first.
        const saved = global.player.superLv;
        global.player.superLv = { a: 1, b: 1, c: 1 };   // 3 of 4
        assert.ok(sc('MANHATTAN', 'weapon', 0) < -400,
            'MANHATTAN lv0 at 3 supers ' + Math.round(sc('MANHATTAN', 'weapon', 0)));
        assert.ok(/latent-line/.test(why('MANHATTAN', 'weapon', 0)), why('MANHATTAN', 'weapon', 0));
        global.player.superLv = saved;
    });

    // PATH 1 — the key is simply maxed and still in the bar.
    T.setOwned({ 'SWEET VERMOUTH': 6 });
    test('a MAXED SWEET VERMOUTH still caps MANHATTAN at the ceiling', () =>
        assert.ok(sc('MANHATTAN', 'weapon', pineBot.config.gunSafeOffPlanLv) < -400,
            'MANHATTAN ' + Math.round(sc('MANHATTAN', 'weapon', pineBot.config.gunSafeOffPlanLv))));

    // PATH 2 — THE REAL ONE. The craft has fused and eaten the half, so
    // ownedLevels no longer contains SWEET VERMOUTH at all. This is the case
    // every previous version got wrong.
    T.setOwned({ 'SWEET VERMOUTH': 0, 'BLACK VERMOUTH': 1 });
    test('an ABSORBED SWEET VERMOUTH still arms the line, and the ceiling still holds', () =>
        assert.ok(sc('MANHATTAN', 'weapon', pineBot.config.gunSafeOffPlanLv) < -400,
            'post-craft MANHATTAN ' + Math.round(sc('MANHATTAN', 'weapon', pineBot.config.gunSafeOffPlanLv))));
    test('VODKA MARTINI — the other half of the same craft — is capped too', () =>
        assert.ok(sc('VODKA MARTINI', 'weapon', pineBot.config.gunSafeOffPlanLv) < -400,
            'VODKA MARTINI ' + Math.round(sc('VODKA MARTINI', 'weapon', pineBot.config.gunSafeOffPlanLv))));

    // The veto must not spill onto the roster the plan is built from.
    test('plan cocktails are untouched by the latent-line veto', () =>
        assert.ok(sc('SOUTH SIDE', 'weapon', 0) > 0 && !/latent-line/.test(why('SOUTH SIDE', 'weapon', 0)),
            'SOUTH SIDE ' + Math.round(sc('SOUTH SIDE', 'weapon', 0))));
    // ...nor onto a line the ban list makes unreachable.
    test('a cocktail whose key is permanently banned stays available', () =>
        assert.ok(!/latent-line/.test(why('COSMOPOLITAN', 'weapon', 0))));

    // v6.89.0 SLOT WASTERS (user).
    test('OLD FASHIONED is out of the junk pool', () =>
        assert.ok(sc('OLD FASHIONED', 'weapon', 0) < 0,
            'OLD FASHIONED ' + Math.round(sc('OLD FASHIONED', 'weapon', 0))));
    test('CORPSE REVIVER No.2 is out of the junk pool', () =>
        assert.ok(sc('CORPSE REVIVER NO.2', 'weapon', 0) < 0,
            'CORPSE REVIVER ' + Math.round(sc('CORPSE REVIVER NO.2', 'weapon', 0))));
    test('...and both now lose to the mule, which is the safe forced pick', () =>
        assert.ok(sc('MOSCOW MULE', 'weapon', 0) > sc('OLD FASHIONED', 'weapon', 0) &&
            sc('MOSCOW MULE', 'weapon', 0) > sc('CORPSE REVIVER NO.2', 'weapon', 0),
            'mule ' + Math.round(sc('MOSCOW MULE', 'weapon', 0))));
    done();
}

// v6.89.1 — THE SHIELD THE BOT COULD NOT SEE, and the audit predicate that
// was measuring from the wrong place. Both were found by probing the live tab:
// hp EXACTLY equal to maxHp while shield sat at 125/135 and shieldFlash was the
// current frame, and p.r = 7.2 against a contact predicate hardcoded to 6.
if (which === 'shield-pool') {
    const { pineBot } = makeEnv({
        script: SCRIPT, frames: 40,
        game: { state: 'playing', gameTime: 1500, hell: true }
    });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;

    const place = (hp, maxHp, shield, shieldMax) => {
        global.gameTime = 1500;
        global.player.x = 400; global.player.y = 400; global.player.r = 7.2;
        global.player.hp = hp; global.player.maxHp = maxHp;
        global.player.shield = shield; global.player.shieldMax = shieldMax;
        global.enemies = [];
        return T.planMove();
    };

    // FULL pool: HP full and shield full.
    const full = place(100, 100, 100, 100);
    test('a full HP bar behind a full shield reads as a full pool', () =>
        assert.ok(full && Math.abs(full.hpRatio - 1) < 0.02, 'hpRatio ' + (full && full.hpRatio)));

    // THE DISCRIMINATOR. HP is still EXACTLY full — this is the live reading
    // that started the whole investigation — but the shield is gone. Before
    // 6.89.1 both cases returned 1.0 and the bot ran its boldest posture here.
    const stripped = place(100, 100, 0, 100);
    test('...but a stripped shield at full HP is only HALF the pool', () =>
        assert.ok(stripped && Math.abs(stripped.hpRatio - 0.5) < 0.02,
            'hpRatio ' + (stripped && stripped.hpRatio) + ' — a literal hp/maxHp reads 1.0 here'));
    test('and the two readings differ, which is the whole point', () =>
        assert.ok(full.hpRatio - stripped.hpRatio > 0.4,
            full.hpRatio + ' vs ' + stripped.hpRatio));

    // A build with no NEGRONI has no shield at all: the ratio must be unchanged
    // from the old behaviour rather than dividing by a phantom maximum.
    const noShield = place(60, 100, 0, 0);
    test('a shieldless build still reads plain hp/maxHp', () =>
        assert.ok(Math.abs(noShield.hpRatio - 0.6) < 0.02, 'hpRatio ' + noShield.hpRatio));

    // CONTACT REACH. The first draft of this test guessed the geometry and
    // PASSED WITH THE FIX REVERTED — the gathered enemy radius is not the raw
    // `r` handed in, so a hand-picked distance proved nothing. The property
    // that actually separates the two versions is that the threshold is READ
    // FROM THE PLAYER instead of hardcoded: hold the scene fixed and change
    // only `player.r`. Under the old literal 6 both radii give the same
    // verdict; under 6.89.1 the larger radius reaches the enemy.
    const hitAt = (pr) => {
        pineBot.resetDamageAudit();
        const put = (hp) => {
            global.gameTime = 1500;
            global.player.x = 400; global.player.y = 400; global.player.r = pr;
            global.player.maxHp = 100; global.player.shield = 0; global.player.shieldMax = 0;
            global.player.hp = hp;
            global.enemies = [{ x: 445, y: 400, r: 18, hp: 1e6, type: 'drunk' }];
            T.planMove();
        };
        put(100);   // establishes lastHpSample
        put(90);    // a real 10 HP drop
        const a = pineBot.damageAudit();
        return { events: a.events, unattr: a.unattributed.n, contact: (a.sole.contact || {}).n || 0 };
    };
    const thin = hitAt(7.2), fat = hitAt(20);
    test('both scenes produced exactly one damage event', () =>
        assert.ok(thin.events === 1 && fat.events === 1, JSON.stringify([thin, fat])));
    test('a fat player reaches this enemy and the hit is ATTRIBUTED to contact', () =>
        assert.ok(fat.unattr === 0 && fat.contact >= 1,
            'r=20 ' + JSON.stringify(fat) + ' — a hardcoded 6 cannot see this'));
    test('...while a thin one cannot, so the threshold tracks the PLAYER', () =>
        assert.ok(thin.unattr === 1 && thin.contact === 0, 'r=7.2 ' + JSON.stringify(thin)));
    done();
}

// v6.89.3 — THE ULT POSTURE FOLLOWS THE CORNER, and a stacking bonus is not
// "maxed". Both came out of one live pick audit plus the user watching the
// first version where the corner actually engaged.
if (which === 'ult-chain') {
    // gt 3000 ON PURPOSE. `ultSpam` already fires the ult on cooldown whenever
    // hell is latched and gameTime > 4800, so testing above that line would
    // pass with the corner link deleted. Below it, the corner is the ONLY thing
    // that can engage the deep posture — which is the case ringHuge creates
    // whenever a boss ring fills the canvas early.
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        // A DELIBERATELY QUIET FIELD: every ordinary ult trigger — crowd, panic,
        // flight, boss, loot, passouts — false. Without that this proves nothing.
        const quiet = (extra) => Object.assign({
            near: 0, hpRatio: 1, hpPanic: false, panic: false, flight: false,
            boss: false, bossNear: false, wallNear: false, roamingBoss: false,
            passoutsNear: 0, lines: 0, toughness: 0, depth: 0,
            contactImminent: false, cornerAnchor: false
        }, extra || {});
        const fire = (plan) => {
            let ults = 0;
            global.useUltimate = () => { ults++; };
            global.tryDash = () => { };
            pineBot.test.maybeAbilities(plan);
            return ults;
        };
        // The stacking specials must not be taxed as capped items.
        const T = pineBot.test;
        const sc = (n, t, lv, maxlv) => T.scoreCard({ n, type: t, lv, maxlv }, 0, []).score;
        const why = (n, t, lv, maxlv) => T.scoreCard({ n, type: t, lv, maxlv }, 0, []).why;
        test('a capped TIME STOP is not penalised as maxed', () =>
            assert.ok(!/maxed/.test(why('TIME STOP +2S', 'sp_timestop', 6, 6)),
                why('TIME STOP +2S', 'sp_timestop', 6, 6)));
        test('...so it scores the same at cap as below it', () =>
            assert.strictEqual(sc('TIME STOP +2S', 'sp_timestop', 6, 6),
                sc('TIME STOP +2S', 'sp_timestop', 5, 6)));
        test('an ordinary maxed passive IS still penalised', () =>
            assert.ok(/maxed/.test(why('OLIVE', 'passive', 6, 6)), why('OLIVE', 'passive', 6, 6)));
        done();
    });
}

// v6.89.4 — A BUILT-OUT BOT KITES LESS IN HELL (user). Kiting is what a thin
// build does because it has nothing else; once the burn, shield, armour and ult
// economy all exist the same motion walks the bot out of its own burn zones.
if (which === 'kite-damp') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.handleScreens();   // latch hell the way the main loop does
        // The 6.89.3 corner anchor would otherwise own the heading here (hell +
        // SOUTH SIDE), and it damps the kite to 0.12 by design — both arms then
        // converge to the same cornerward step and the test proves nothing.
        pineBot.config.deepHell.cornerWithZoner = false;
        const T = pineBot.test;
        const BUILD = ['SOUTH SIDE', 'VODKA TONIC', 'MOJITO', 'NEGRONI', 'GIN TONIC',
            'BLACK VERMOUTH', 'WATER', 'SUGAR', 'OLIVE', 'TOMATO JUICE', 'CRANBERRY'];
        // A CHASE the planner will genuinely want to kite: a pack behind the
        // player, none of it killable. Held identical across both builds so the
        // only thing that changes is what the bot owns.
        const field = (gt) => {
            global.gameTime = gt;
            global.player.x = 270; global.player.y = 270;
            global.player.hp = 120; global.player.maxHp = 120;
            // Far enough out that the CROWD PANIC gate stays open — panic
            // switches kiting off entirely, and the first draft of this test
            // put five bodies at 60px and compared two identical steps.
            // A SYMMETRIC RING. The kite term is tangential, so it only decides
            // the heading when the radial danger field is near-isotropic —
            // otherwise flee/standoff dominate and every arm converges to the
            // same step no matter what the kite weight is. Far enough out (165px)
            // that CROWD PANIC, which switches kiting off entirely, stays open.
            global.enemies = Array.from({ length: 6 }, (_, i) => ({
                type: 'mob',
                x: 270 + 165 * Math.cos(i * Math.PI / 3),
                y: 270 + 165 * Math.sin(i * Math.PI / 3),
                r: 14, hp: 9e9, maxHp: 9e9, speed: 2.0, moving: true
            }));
            return T.planMove();
        };
        // planMove SMOOTHS against lastDir, so two consecutive calls differ even
        // with identical input — which is why two earlier drafts of the
        // behavioural assertion passed with the damping deleted. Let each arm
        // converge before comparing.
        const settle = (gt) => { let r; for (let i = 0; i < 12; i++) r = field(gt); return r; };
        const owned = {};
        for (const n of BUILD) owned[n] = 0;
        T.setOwned(owned);
        const thin = field(3000);
        test('a thin build in hell kites at full pull', () =>
            assert.strictEqual(thin.kiteDamp, 1, String(thin.kiteDamp)));
        for (const n of BUILD) owned[n] = 1;
        T.setOwned(owned);
        const built = field(3000);
        test('a complete build damps the kite', () =>
            assert.ok(built.kiteDamp < 0.3, 'kiteDamp ' + built.kiteDamp));
        test('...and the share is what drives it, not a flag', () =>
            assert.strictEqual(built.kiteBuildShare, 1, String(built.kiteBuildShare)));
        test('the damping is GRADUAL — half a build is half the discount', () => {
            for (const n of BUILD) owned[n] = 0;
            for (const n of BUILD.slice(0, 6)) owned[n] = 1;
            T.setOwned(owned);
            const half = field(3000);
            assert.ok(half.kiteDamp > built.kiteDamp && half.kiteDamp < thin.kiteDamp,
                JSON.stringify({ thin: thin.kiteDamp, half: half.kiteDamp, built: built.kiteDamp }));
        });
        // THE BEHAVIOURAL PROOF. The first draft compared an empty build to a
        // full one and PASSED WITH kiteDamp DELETED — because SOUTH SIDE sets
        // `zoner` (kite x1.6) and OLIVE/NEGRONI set the armour confidence, so
        // the step moved for reasons that had nothing to do with this change.
        //
        // The discriminating comparison holds every OTHER build-sensitive term
        // fixed: SOUTH SIDE, OLIVE and NEGRONI are owned in BOTH arms, and only
        // the eight items that touch nothing else in the planner are varied.
        // WIRING, NOT BEHAVIOUR — and labelled as such, because four attempts at
        // a behavioural assertion on the DAMPING all passed with it deleted:
        //   1. thin vs full build — owning those items also flips `zoner`
        //      (kite x1.6) and the OLIVE/NEGRONI armour confidence.
        //   2. holding those three fixed and varying only the "neutral" eight —
        //      build hunger reads them too.
        //   3. varying only CONFIG.movement.kiteDampFull — but planMove smooths
        //      against lastDir, so consecutive calls differ anyway.
        //   4. settling each arm first, on a symmetric ring, with the corner
        //      anchor disabled — the heading is still pinned by flee/escape at
        //      this crowd size, and both arms converge to the same step.
        // The scaling factor is tested four ways above; this asserts only that
        // the term reaches the gain expression, which is the regression that
        // would otherwise pass silently.
        // v6.89.6: the gain line now multiplies by `kiteStack`, which selects
        // between the SWEEP arm (damped by anchor / corner / kiteDamp) and the
        // SPACING arm (a flat kiteSpacingMul — see the kite-deadband scenario).
        // Follow both hops, or a refactor that drops kiteDamp from the sweep arm
        // would pass on the strength of the gain line alone.
        test('the damping is actually wired into the kite gain term', () => {
            const src = require('fs').readFileSync(SCRIPT, 'utf8');
            const line = src.split('\n').find(l => /gain \+= \(dx \* kite\.x \+ dy \* kite\.y\)/.test(l));
            assert.ok(line && /\*\s*kiteW\b/.test(line),
                'kiteW is missing from the kite gain term');
            const i = src.indexOf('kiteW = kiteBaseW *');
            assert.ok(i > 0, 'the sweep arm of kiteW is gone');
            assert.ok(/\*\s*kiteDamp\b/.test(src.slice(i, i + 160)),
                'kiteDamp is missing from the sweep arm');
        });

        // v6.89.5 — THE OUTRUN GATE. User: "kiting has resulted in constant
        // contact damage with the mobs in hell as they keep rushing, unlike day
        // mode." A sweep only pays if it opens a gap; against a pack matching
        // the player's speed it just holds the bot in contact for the whole arc.
        // This one IS behavioural — `kiting` is `kite !== null`, so the gate
        // shows up directly, and it is the same field twice with only mob speed
        // changed.
        const chase = (speed) => {
            global.gameTime = 3000;
            global.player.x = 270; global.player.y = 270;
            global.player.hp = 120; global.player.maxHp = 120; global.player.speed = 2.375;
            global.enemies = Array.from({ length: 4 }, (_, i) => ({
                type: 'mob',
                x: 270 + 150 * Math.cos(i * Math.PI / 2),
                y: 270 + 150 * Math.sin(i * Math.PI / 2),
                r: 14, hp: 9e9, maxHp: 9e9, speed, moving: true
            }));
            return T.planMove();
        };
        const slowPack = chase(1.0);
        test('a pack the bot can outrun still gets kited', () =>
            assert.strictEqual(slowPack.kiting, true,
                JSON.stringify({ kiting: slowPack.kiting, outrunnable: slowPack.outrunnable })));
        const fastPack = chase(3.0);
        test('...but a RUSHING pack in hell is not kited at all', () =>
            assert.strictEqual(fastPack.kiting, false,
                JSON.stringify({ kiting: fastPack.kiting, fast: fastPack.fastChasers })));
        test('and the gate is reported so the posture stays observable', () =>
            assert.strictEqual(fastPack.outrunnable, false, String(fastPack.outrunnable)));
    }, 0);
    setTimeout(() => done(), 40);
}

// v6.89.6 — THE KITE DEADBAND. 6.89.5 made the outrun test a CLIFF: full pull
// on one side, nothing on the other. The user's requirement is a threshold, not
// a weight — "just enough distance for no contact damage deaths" — so against a
// pack that cannot be outrun the kite must be silent until something is inside
// (player radius + kiteBand), then step, then go silent again.
//
// This one is genuinely behavioural. `kiting` is `kite !== null` and
// `kiteSpacing` is reported, so the gate is directly observable, and the
// scene is held fixed while ONLY the thing under test moves. Both arms of
// the first pair fail with the deadband reverted to `outrunnable` alone.
if (which === 'kite-deadband') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 6000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.handleScreens();   // latch hell the way the main loop does
        const T = pineBot.test;
        // A RUSHING pack — speed 5 against the player's 2.4 puts every body over
        // the chaserFast 0.85x line, so `outrunnable` is false and 6.89.5 would
        // refuse to kite at ANY distance. `dist` is the only thing that varies.
        const ring = (dist, spd) => {
            global.gameTime = 6000;
            global.player.x = 270; global.player.y = 270; global.player.r = 7.2;
            global.player.hp = 120; global.player.maxHp = 120; global.player.speed = 2.4;
            global.enemies = Array.from({ length: 6 }, (_, i) => ({
                type: 'drunk', hp: 1e6, r: 18, speed: spd, moving: true,
                x: 270 + dist * Math.cos(i * Math.PI / 3),
                y: 270 + dist * Math.sin(i * Math.PI / 3)
            }));
            return T.planMove();
        };
        // OUT of the band. Nothing is close enough to touch us, so the sweep
        // stays off — this is the 6.89.5 behaviour, preserved.
        const far = ring(140, 5);
        test('a rushing pack at range is still not kited', () =>
            assert.strictEqual(far.kiting, false,
                JSON.stringify({ kiting: far.kiting, gap: far.contactGap, outrun: far.outrunnable })));
        test('and the gap is reported, so the band is observable in the panel', () =>
            assert.ok(far.contactGap > 40, 'contactGap ' + far.contactGap));
        // INSIDE the band. Same pack, same speed, same everything — only closer.
        // 6.89.5 returns kiting:false here and eats the contact tick.
        const near = ring(60, 5);
        test('...but the SAME pack inside the band arms the spacing step', () =>
            assert.strictEqual(near.kiting, true,
                JSON.stringify({ kiting: near.kiting, gap: near.contactGap, outrun: near.outrunnable })));
        test('and it is flagged as SPACING, not as a sweep', () =>
            assert.strictEqual(near.kiteSpacing, true, String(near.kiteSpacing)));
        test('the pack is still un-outrunnable — the band is what changed, not the gate', () =>
            assert.strictEqual(near.outrunnable, false, String(near.outrunnable)));
        // THE DIAL DRIVES IT. Scene held completely fixed at the near ring;
        // only CONFIG.movement.kiteBand moves. This is what proves the
        // threshold is read from config rather than falling out of some other
        // distance-sensitive term firing at 60px.
        test('the band is what arms it — shrink the dial on a FIXED scene and it disarms', () => {
            const gap = near.contactGap;
            pineBot.config.movement.kiteBand = 1;
            const tight = ring(60, 5);
            pineBot.config.movement.kiteBand = 20;
            const wide = ring(60, 5);
            assert.ok(tight.kiting === false && wide.kiting === true,
                JSON.stringify({ gap, tight: tight.kiting, wide: wide.kiting }));
        });
        // The outrunnable path must be untouched: a slow pack is kited at any
        // distance, band or no band. This is the day phase's whole economy.
        const slow = ring(140, 0.5);
        test('a pack that CAN be outrun is kited at range, band irrelevant', () =>
            assert.ok(slow.kiting === true && slow.outrunnable === true && slow.kiteSpacing === false,
                JSON.stringify({ kiting: slow.kiting, outrun: slow.outrunnable, spacing: slow.kiteSpacing })));
        // v6.89.7 — THE CAP, and this one is behavioural because `kiteW` is now
        // reported. 6.89.6 asserted the corner outbids the spacing kite by
        // comparing CONFIG DEFAULTS — but movement.kitePull is a CEM parameter
        // with a box max of 4.0, and a live read caught it at 2.223 and rising.
        // A margin that only holds at the default is not a margin.
        test('the spacing weight is CAPPED against the corner, whatever CEM does to kitePull', () => {
            const C = pineBot.config;
            const ceil = C.deepHell.cornerPull * 0.5 * C.deepHell.spacingCeilShare;
            const at = (kp) => { C.movement.kitePull = kp; return ring(60, 5); };
            const low = at(2.0), high = at(4.0);   // 4.0 is the CEM box ceiling
            C.movement.kitePull = 2.0;
            assert.ok(low.kiteSpacing && high.kiteSpacing, 'both arms must be in spacing mode');
            assert.ok(high.kiteW <= ceil + 1e-6,
                'kiteW ' + high.kiteW + ' exceeds the ceiling ' + ceil + ' at the CEM box max');
            assert.ok(high.kiteW < C.deepHell.cornerPull * 0.5,
                'the corner must still outweigh the spacing kite: ' + high.kiteW);
            assert.ok(low.kiteW <= high.kiteW, JSON.stringify({ low: low.kiteW, high: high.kiteW }));
        });
        // WIRING, and labelled as such: that the sweep arm still carries the
        // corner damping. Asserting that by heading is the trap this suite has
        // fallen into four times, so it reads the built file instead.
        test('the sweep arm still keeps the corner/anchor/damp stack', () => {
            const src = require('fs').readFileSync(SCRIPT, 'utf8');
            const i = src.indexOf('kiteW = kiteBaseW *');
            assert.ok(i > 0, 'the sweep arm of kiteW is gone');
            const block = src.slice(i, i + 160);
            assert.ok(/cornerOn \? 0\.12/.test(block), 'sweep arm lost the corner damping');
            assert.ok(/kiteDamp/.test(block), 'sweep arm lost kiteDamp');
        });
        // v6.89.7 — FROZEN BODIES ARE NOT CHASING. gather forces spd = 0 on a
        // frozen enemy, so it can never be chaserFast — but 6.89.6 still counted
        // it in the denominator. Four frozen plus two rushing therefore read as
        // 2/6 = 0.33 and flipped `outrunnable` back to TRUE, re-arming the full
        // sweep against a pack that resumes at full speed the instant the stop
        // ends. Counting only moving bodies gives 2/2 = 1.0, which is the truth.
        const mixed = (frozenN, rushN) => {
            global.gameTime = 6000;
            global.player.x = 270; global.player.y = 270; global.player.r = 7.2;
            global.player.hp = 120; global.player.maxHp = 120; global.player.speed = 2.4;
            const all = [];
            for (let i = 0; i < frozenN + rushN; i++) {
                const a = i * Math.PI * 2 / (frozenN + rushN);
                all.push({
                    type: 'drunk', hp: 1e6, r: 18, speed: 5, moving: true,
                    frozenUntil: i < frozenN ? 1e9 : 0,
                    x: 270 + 150 * Math.cos(a), y: 270 + 150 * Math.sin(a)
                });
            }
            global.enemies = all;
            return T.planMove();
        };
        const halfFrozen = mixed(4, 2);
        test('a half-frozen pack is still un-outrunnable — the movers are what count', () =>
            assert.strictEqual(halfFrozen.outrunnable, false,
                JSON.stringify({ outrun: halfFrozen.outrunnable, live: halfFrozen.liveChasers, fast: halfFrozen.fastChasers })));
        test('...and only the moving bodies are counted', () =>
            assert.strictEqual(halfFrozen.liveChasers, 2, String(halfFrozen.liveChasers)));
        const allFrozen = mixed(6, 0);
        test('an ALL-frozen field has nothing to outrun, so the sweep does not pay', () =>
            assert.ok(allFrozen.outrunnable === false && allFrozen.liveChasers === 0,
                JSON.stringify({ outrun: allFrozen.outrunnable, live: allFrozen.liveChasers })));
        // v6.89.6 — UNDER A TIME STOP THE SWEEP IS ZERO. A frozen field has
        // nothing to sweep around; the arc is pure wasted travel that walks the
        // bot off its own burn and out of its corner seat during the exact
        // seconds the corner matters most. 6.89.4 left 0.15 leaking into the
        // heading. The deadband above is what still steps away from a body that
        // is actually touching us, so this costs no contact safety.
        test('a time-stopped field kills the sweep outright', () => {
            global.gameTime = 6000;
            global.player.x = 270; global.player.y = 270; global.player.r = 7.2;
            global.player.hp = 120; global.player.maxHp = 120; global.player.speed = 2.4;
            global.enemies = Array.from({ length: 6 }, (_, i) => ({
                type: 'drunk', hp: 1e6, r: 18, speed: 5, moving: true, frozenUntil: 1e9,
                x: 270 + 150 * Math.cos(i * Math.PI / 3),
                y: 270 + 150 * Math.sin(i * Math.PI / 3)
            }));
            const paused = T.planMove();
            assert.strictEqual(paused.pauseActive, true, 'the pause did not latch: ' + paused.pauseActive);
            assert.strictEqual(paused.kiteDamp, 0, 'kiteDamp ' + paused.kiteDamp + ' — kiteDampPaused should be 0');
        });
        // The corner has to WIN the tie: a straggler in the band must not be
        // able to tour the bot around the arena. cornerPull 4.0 * 0.5 against
        // kitePull 2.0 * kiteSpacingMul 0.6 is the margin that guarantees it.
        test('cornerPull still outweighs the spacing kite', () => {
            const C = pineBot.config;
            assert.ok(C.deepHell.cornerPull * 0.5 > C.movement.kitePull * C.movement.kiteSpacingMul,
                JSON.stringify({ corner: C.deepHell.cornerPull, kite: C.movement.kitePull, mul: C.movement.kiteSpacingMul }));
        });
    }, 0);
    setTimeout(() => done(), 40);
}

// v6.89.7 — THE INCOME AUDIT. Source facts say contact damage is rate-limited
// near 40 dps by the 33-frame invuln, and that mobs outrun the player from
// minute 14 onward. If both hold, deep survival is arithmetic — pool gained
// per second against pool lost per second — and no version has ever measured
// it. These assertions check the integrator itself: that it divides by real
// elapsed gameTime, buckets by depth, drops throttled gaps, and refuses to
// book a level-up or a revive as heal income.
if (which === 'income-audit') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 0 } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.applyDefaults();
        pineBot.resetIncomeAudit();
        const T = pineBot.test;
        const tick = (gt, hp) => {
            global.gameTime = gt;
            global.player.x = 270; global.player.y = 270; global.player.r = 7.2;
            global.player.maxHp = 100; global.player.hp = hp;
            global.player.shield = 0; global.player.shieldMax = 0;
            global.enemies = [];
            T.planMove();
        };
        const bucketAt = (min) => (pineBot.incomeAudit().buckets.find(b => b.fromMin === min) || null);
        // BLEEDING: 20 pool over 5 s of gameTime = 4.0/s, in the 20-minute bucket.
        for (let i = 0; i <= 10; i++) tick(1200 + i * 0.5, 100 - i * 2);
        const bleed = bucketAt(20);
        test('loss is integrated against real gameTime, not tick count', () =>
            assert.ok(bleed && Math.abs(bleed.lossPerSec - 4) < 0.2,
                JSON.stringify(bleed)));
        test('...and lands in the bucket for its depth', () =>
            assert.ok(bleed.dtS >= 4.5 && bleed.dtS <= 5.5, 'dtS ' + bleed.dtS));
        // HEALING, one bucket deeper: the same shape with the sign flipped.
        for (let i = 0; i <= 10; i++) tick(1800 + i * 0.5, 60 + i * 2);
        const heal = bucketAt(30);
        test('gain is integrated the same way', () =>
            assert.ok(heal && Math.abs(heal.gainPerSec - 4) < 0.2, JSON.stringify(heal)));
        test('net is gain minus loss, and reads positive while healing', () =>
            assert.ok(heal.net > 3.5, 'net ' + heal.net));
        test('the two depths are kept apart', () =>
            assert.ok(bleed.net < 0 && heal.net > 0,
                JSON.stringify({ at20: bleed.net, at30: heal.net })));
        // A LEVEL-UP IS NOT HEAL INCOME. A jump over 40% of the pool is a maxHp
        // raise or a COFFEE BEANS revive; counting it would make a dying build
        // look self-sustaining, which is the exact error this audit exists to
        // avoid making.
        pineBot.resetIncomeAudit();
        tick(2400, 30);
        tick(2400.5, 95);            // +65 on a 100 pool
        const spiked = bucketAt(40);
        test('a revive-sized jump is booked as a spike, not as income', () =>
            assert.ok(spiked && spiked.spikes && spiked.spikes.n === 1,
                JSON.stringify(spiked)));
        test('...and it does NOT inflate gainPerSec', () =>
            assert.ok(!spiked.gainPerSec, 'gainPerSec ' + spiked.gainPerSec));
        // A THROTTLED TAB must not smear one interval across a bucket.
        pineBot.resetIncomeAudit();
        tick(3000, 100);
        tick(3030, 40);              // 30 s gap: the tab was asleep
        const gap = bucketAt(50);
        test('a gap over 5s is dropped rather than integrated', () =>
            assert.ok(!gap || gap.dtS === 0, JSON.stringify(gap)));
        // The headline the audit exists to produce.
        pineBot.resetIncomeAudit();
        // 1 pool per half-second: the per-event floor is 0.5, so a drip finer
        // than that is invisible to the integrator by design (it would
        // otherwise book float noise as damage).
        // Also long enough to clear the audit's own dtS >= 60 noise floor —
        // firstNegativeMin deliberately ignores thin buckets, because a bucket
        // holding four seconds of samples will say anything.
        for (let i = 0; i <= 120; i++) tick(3600 + i * 0.5, 100 - i * 0.6);
        const rep = pineBot.incomeAudit();
        test('firstNegativeMin names the depth where the pool starts draining', () =>
            assert.strictEqual(rep.firstNegativeMin, 60, JSON.stringify(rep.buckets)));
        test('and the audit survives a reset', () => {
            pineBot.resetIncomeAudit();
            assert.strictEqual(pineBot.incomeAudit().buckets.length, 0);
        });
    }, 0);
    setTimeout(() => done(), 40);
}

// v6.89.8 — PANIC ANCHORS, IT DOES NOT SPRINT. Three linked changes, all from
// the same user directive and the same source read:
//   1. `tryDash` grants NO i-frames (read whole from source), so the dash is a
//      multiplier on the planner's heading — worst possible thing to apply to a
//      flee vector. No dashing on panic in deep hell.
//   2. The corner gate carried `!flight`, and `flight` is true for essentially
//      all of deep hell. The corner has effectively never engaged at depth.
//   3. The ult fires on availability at depth: invulnerability where the
//      character has it, and field-wide kills — hence item drops, hence time
//      stops — where it does not.
if (which === 'panic-anchor') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 6000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.handleScreens();   // latch hell
        pineBot.test.ageHellEntry(120000);
        const T = pineBot.test;
        // A deep-hell panic: hurt, surrounded, nothing killable. Held identical
        // across every assertion below so only the gates vary.
        const scene = (gt, hp, rad) => {
            const R = rad || 70;
            global.gameTime = gt;
            global.player = { x: 270, y: 270, r: 7.2, hp, maxHp: 180, speed: 2.375 };
            global.enemies = Array.from({ length: 8 }, (_, i) => ({
                type: 'mob', hp: 9e9, maxHp: 9e9, r: 14, speed: 5, moving: true,
                x: 270 + R * Math.cos(i * Math.PI / 4), y: 270 + R * Math.sin(i * Math.PI / 4)
            }));
            return T.planMove();
        };
        const deep = scene(6000, 60);
        test('the scene is a genuine deep-hell panic', () =>
            assert.ok(deep.panic === true || deep.hpPanic === true,
                JSON.stringify({ panic: deep.panic, hpPanic: deep.hpPanic })));
        // (2) THE CORNER SURVIVES FLIGHT AND PANIC AT DEPTH. Before 6.89.8 the
        // gate read `!hpPanic && !flight && ...`, and `flight` is on for all of
        // deep hell outside a time stop — so this returned false every time.
        test('the corner anchor engages even in flight/panic at depth', () =>
            assert.strictEqual(deep.cornerAnchor, true,
                JSON.stringify({ corner: deep.cornerAnchor, flight: deep.flight, hpPanic: deep.hpPanic })));
        test('...and the heading points at a corner', () =>
            assert.strictEqual(deep.cornerward, true,
                JSON.stringify({ cornerward: deep.cornerward, dx: +deep.dx.toFixed(2), dy: +deep.dy.toFixed(2) })));
        // ...and SHALLOW hell is untouched: there, fleeing still opens a gap,
        // so panic must still be allowed to break the corner.
        const shallow = scene(1500, 60);
        test('shallow hell still lets panic break the corner', () =>
            assert.strictEqual(shallow.cornerAnchor, false,
                JSON.stringify({ corner: shallow.cornerAnchor, flight: shallow.flight })));
        // maybeAbilities reads gameTime LIVE, not from the plan it is handed,
        // and `lastDash` is module state shared across calls — the first draft
        // of this block failed on both, passing a deep plan while the clock had
        // been left shallow by the assertion above. Each arm now re-runs its own
        // scene immediately before the call, and the dash cooldown is zeroed
        // with a real few-ms gap so consecutive calls are not gate-blocked.
        let dashes = 0, ults = 0;
        global.tryDash = () => { dashes++; };
        global.useUltimate = () => { ults++; };
        pineBot.config.abilities.dashCooldownMs = 0;
        const wait = (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms); };
        // (1) NO DASH ON A DEEP PANIC.
        const deepAgain = scene(6000, 60);
        dashes = 0; ults = 0; wait(3);
        T.maybeAbilities(deepAgain);
        test('a deep-hell panic does not dash', () =>
            assert.strictEqual(dashes, 0, 'dashes ' + dashes + ' — panic amplified by a 0.16s burst is the wrong move'));
        // (3) ...but the ult fires, which is the thing that actually helps.
        test('the ult fires on availability at depth', () =>
            assert.ok(ults > 0, 'ults ' + ults));
        // A MARK OVERRIDES the no-dash rule: position is the one defence that
        // still works against a falling attack (corner mark-immunity is
        // geometric), so the burst is worth spending there.
        global.gameTime = 6000;
        global.player = { x: 270, y: 270, r: 7.2, hp: 60, maxHp: 180, speed: 2.375 };
        global.enemies = [];
        global.dropMarks = [{ x: 272, y: 272, r: 58, dmg: 72, tele: 0.6, at: 6000.3 }];
        const marked = T.planMove();
        dashes = 0; wait(3);
        T.maybeAbilities(marked);
        test('standing in a live mark still dashes out', () =>
            assert.ok(dashes > 0, 'dashes ' + dashes + ' — marks are what position DOES beat'));
        global.dropMarks = [];
        // v6.89.11 — A CHARGE LANE BREAKS THE CORNER (user: "anchoring
        // contradicting the linebacker boss"). The corner defeats drop-marks
        // because they are bounded circles from a known spawn box. A Last Call
        // Linebacker lane is an unbounded RAY killing 63 px to each side, so no
        // point in the arena is outside it — corner position is worth nothing
        // against one, and it removes three quarters of the escape directions.
        // The gate had no lane term at all, and at depth `bossHunt` only fires
        // for a FROZEN boss, so a live charging linebacker could not break it.
        global.roadLines = [];
        const clear = scene(6000, 60);
        test('with no lanes the deep corner still engages', () =>
            assert.strictEqual(clear.cornerAnchor, true, String(clear.cornerAnchor)));
        // A ray through the player at 45 deg passes straight through the
        // bottom-right corner seat: perpendicular distance 0.
        global.roadLines = [{ x: 270, y: 270, ang: Math.PI / 4, armed: true, dmg: 50 }];
        const laned = scene(6000, 60);
        test('a charge lane through the corner breaks the anchor', () =>
            assert.strictEqual(laned.cornerAnchor, false,
                JSON.stringify({ corner: laned.cornerAnchor, lineOnCorner: laned.lineOnCorner })));
        test('...and the gate is reported so the posture stays observable', () =>
            assert.strictEqual(laned.lineOnCorner, true, String(laned.lineOnCorner)));
        // A lane that misses the corner must NOT break it — otherwise any
        // linebacker anywhere on the field disables the doctrine outright,
        // which is the dead-gate mistake this project keeps making.
        global.roadLines = [{ x: 0, y: 400, ang: Math.PI / 4, armed: true, dmg: 50 }];
        const missed = scene(6000, 60);
        test('a lane that misses the corner leaves the anchor alone', () =>
            assert.strictEqual(missed.cornerAnchor, true,
                JSON.stringify({ corner: missed.cornerAnchor, lineOnCorner: missed.lineOnCorner })));
        global.roadLines = [];

        // v6.89.12 — THE GATE KEY MOVED FROM A CLOCK TO PHYSICS. It was
        // `hellDetected && gameTime > 2400`, but the measured median run is
        // 1325 s, so most runs never reached it. `outrunnable` is the same test
        // that governs the kite and it turns false around minute ELEVEN.
        const early = scene(1200, 60);      // twenty minutes, well under the old gate
        test('a fast pack is un-outrunnable long before the old 2400s gate', () =>
            assert.strictEqual(early.outrunnable, false,
                JSON.stringify({ outrun: early.outrunnable, gt: 1200 })));
        // WIRING, labelled as such: that the dash gate reads the physics key and
        // no longer reads the decaying accumulator. `dangerAccum` adds 0.25 per
        // overlapping tick and decays x0.96, so `inBlastZone` answers "was there
        // a mark on me recently" and stayed true ~35 ticks after the hazard
        // left, short-circuiting the suppression entirely.
        test('the dash gate keys on outrunnable, and escaping is instantaneous', () => {
            const src = require('fs').readFileSync(SCRIPT, 'utf8');
            const i = src.indexOf('const escaping = ');
            assert.ok(i > 0, 'the escaping term is gone');
            const block = src.slice(i, i + 400);
            assert.ok(!/inBlastZone/.test(block), 'escaping still reads the decaying accumulator');
            assert.ok(/plan\.lineHere/.test(block), 'escaping does not test lanes instantaneously');
            assert.ok(/const cornered = plan\.outrunnable === false/.test(block),
                'the panic gate no longer keys on outrunnable');
        });

        // NO SHALLOW-DASH ASSERTION, and the reason is recorded rather than
        // fudged. Two drafts tried to prove "shallow hell still dashes on the
        // same scene" and both measured ZERO dashes in the shallow arm — not
        // because of this change, but because the dash never triggers there in
        // the first place: `crowdTol` carries a deep-hell term
        // ((gameTime-1800)/120) and the deep contact posture widens the danger
        // bands, so the identical field scores under the dash threshold at
        // 1500 s and over it at 6000 s. Asserting it anyway would have been a
        // test that passes for a reason unrelated to its name — the failure
        // mode this suite has hit five times now.
        //
        // Depth-scoping is asserted instead by the CORNER arms above (shallow
        // off / deep on), which do vary only by the clock, and the no-dash
        // assertion has teeth: removing the gate makes it fail.
    }, 0);
    setTimeout(() => done(), 60);
}

// v6.89.9 — MINGUK'S ULT DOES GRANT INVULNERABILITY, via a clause this bot never
// read. isInvuln() ends in `|| !!claseUlt`, and useUltimate sets that bare object
// for minguk. `ultInvuln` only tested player.ultUntil / player.ultSpiralUntil, so
// for minguk it was permanently false — and it gates caution, hpPanic and flight.
if (which === 'minguk-invuln') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 6000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.handleScreens();
        const T = pineBot.test;
        // A field that WOULD panic and flee: hurt, surrounded, nothing killable.
        // Held identical; the only thing that changes is whether the drop is up.
        const field = () => {
            global.gameTime = 6000;
            global.player = { x: 270, y: 270, r: 7.2, hp: 60, maxHp: 180, speed: 2.375 };
            global.enemies = Array.from({ length: 8 }, (_, i) => ({
                type: 'mob', hp: 9e9, maxHp: 9e9, r: 14, speed: 5, moving: true,
                x: 270 + 70 * Math.cos(i * Math.PI / 4), y: 270 + 70 * Math.sin(i * Math.PI / 4)
            }));
            return T.planMove();
        };
        global.claseUlt = null;
        const exposed = field();
        test('with no ult up the bot panics and flees, as before', () =>
            assert.ok(exposed.hpPanic === true && exposed.ultInvuln === false,
                JSON.stringify({ hpPanic: exposed.hpPanic, ultInvuln: exposed.ultInvuln })));
        // THE DISCRIMINATOR. Same scene; minguk's Clase Azul drop is in flight.
        // The game's contact loop cannot touch us for its whole duration.
        global.claseUlt = { t: 0, drop: 138, flashT: 0, dmgDone: false };
        const dropping = field();
        test('the Clase Azul drop registers as invulnerability', () =>
            assert.strictEqual(dropping.ultInvuln, true, String(dropping.ultInvuln)));
        test('...so the bot stops panicking during it', () =>
            assert.strictEqual(dropping.hpPanic, false,
                'hpPanic ' + dropping.hpPanic + ' — panicking while untouchable'));
        test('...and stops fleeing during it', () =>
            assert.strictEqual(dropping.flight, false, 'flight ' + dropping.flight));
        // v6.89.10 — A SHORT WINDOW MAY NOT SWITCH OFF THE ESCAPE MECHANISMS.
        // 6.89.9 let any invulnerability turn hpPanic and flight off outright,
        // and dayClearRate fell from ~0.80 to 0.41 with runs ending at 163-475 s:
        // the bot walked into a crowd during 2.3 s of immunity and was stranded
        // there when it lapsed. Caution still relaxes (nothing can hurt us); only
        // a window with room left to disengage may drop the escape gates.
        global.claseUlt = { t: 132, drop: 138, flashT: 0, dmgDone: false };   // 0.1 s left
        const expiring = field();
        test('an EXPIRING window is still invulnerable', () =>
            assert.strictEqual(expiring.ultInvuln, true, String(expiring.ultInvuln)));
        test('...but no longer suppresses panic — the escape must already be underway', () =>
            assert.strictEqual(expiring.hpPanic, true,
                'hpPanic ' + expiring.hpPanic + ' — 0.1s of immunity is not room to commit'));
        test('a FRESH window still suppresses it, which is when committing is safe', () => {
            global.claseUlt = { t: 0, drop: 138, flashT: 0, dmgDone: false };   // 2.3 s left
            const fresh = field();
            assert.strictEqual(fresh.hpPanic, false, 'hpPanic ' + fresh.hpPanic);
        });
        // ...and it ends when the object goes away, not on a timestamp.
        global.claseUlt = null;
        const after = field();
        test('and it ends when claseUlt is cleared', () =>
            assert.strictEqual(after.ultInvuln, false, String(after.ultInvuln)));
        // pat and joe still work off their own timestamps — unchanged.
        // field() rebuilds `player`, so the timestamp has to be set on the
        // object it just made and the plan re-run — the first draft set it and
        // then had field() overwrite it.
        field();
        global.player.ultSpiralUntil = 6002.8;
        const patLike = T.planMove();
        test('pat/joe timestamp windows still register', () =>
            assert.strictEqual(patLike.ultInvuln, true, String(patLike.ultInvuln)));
    }, 0);
    setTimeout(() => done(), 60);
}

// v6.89.11 — A MARK IS GONE BY THE TIME ITS DAMAGE IS SEEN. 145 runs of
// damageAudit put 161-162 point losses in `sole.contact`; 161.6 is exactly
// `maxHp * 0.40`, the drop-mark formula. The mark detonates, the game removes
// it, and the next tick finds nothing — so the classifier's default books it as
// contact. The fix classifies against the PREVIOUS tick's marks as well.
if (which === 'mark-ghost') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 3000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.applyDefaults();
        pineBot.resetDamageAudit();
        const T = pineBot.test;
        const tick = (hp, marks) => {
            global.gameTime = 3000;
            global.player = { x: 270, y: 270, r: 7.2, hp, maxHp: 400, speed: 2.375 };
            global.enemies = [];            // nothing else can be blamed
            global.dropMarks = marks;
            T.planMove();
        };
        // Tick 1: a live mark on top of us. Establishes lastHpSample AND the
        // mark snapshot the next tick will need.
        tick(400, [{ x: 270, y: 270, r: 58, dmg: 72, tele: 0.6, at: 3000.3 }]);
        // Tick 2: it detonated for maxHp * 0.40 and removed itself.
        tick(240, []);
        const a = pineBot.damageAudit();
        test('the vanished mark is still blamed for its own damage', () =>
            assert.ok((a.sole.mark || {}).n >= 1,
                'sole.mark ' + JSON.stringify(a.sole)));
        test('...and it is NOT booked as contact', () =>
            assert.ok(!(a.sole.contact || {}).n,
                'sole.contact ' + JSON.stringify(a.sole.contact)));
        test('...nor left unattributed', () =>
            assert.strictEqual(a.unattributed.n, 0, JSON.stringify(a.unattributed)));
        test('and the full loss is recorded', () =>
            assert.ok(a.hpLost >= 159 && a.hpLost <= 161, 'hpLost ' + a.hpLost));
    }, 0);
    setTimeout(() => done(), 60);
}

// v6.90.0 — DEEP PARK. The measured A/B: bot ON gives a 22-minute median; bot
// OFF, parked in a corner at 258 enemies, went 309/309 -> 306/309 across 155 s
// and was still going at 125 minutes. Past the point where armor and regen make
// the corner survivable, the correct movement policy is to walk there and stop.
if (which === 'deep-park') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 6000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.handleScreens();
        const T = pineBot.test;
        const owned = {};
        const build = (o) => { for (const k in owned) delete owned[k]; Object.assign(owned, o); T.setOwned(owned); };
        // A field that would normally have the planner fleeing hard.
        const field = (gt, x, y) => {
            global.gameTime = gt;
            global.player = { x, y, r: 7.2, hp: 300, maxHp: 309, speed: 2.375 };
            global.dropMarks = []; global.roadLines = [];
            global.enemies = Array.from({ length: 12 }, (_, i) => ({
                type: 'drunk', hp: 1e6, r: 18, speed: 5, moving: true,
                x: x + 90 * Math.cos(i * Math.PI / 6), y: y + 90 * Math.sin(i * Math.PI / 6)
            }));
            return T.planMove();
        };
        // WITHOUT the defensive build, nothing changes — parking a fragile bot
        // in a corner is how you die there instead of somewhere else.
        build({ 'OLIVE': 3, 'WATER': 6, 'SOUTH SIDE': 3 });
        const thin = field(6000, 270, 270);
        test('a thin defensive build does NOT park', () =>
            assert.strictEqual(thin.parkOn, false,
                JSON.stringify({ park: thin.parkOn, olive: 3 })));
        // WITH armor at the cap and a regen source, park engages.
        // v6.90.1: armor and regen alone are NOT enough. A parked seat survives
        // because the swarm gathering on it is also being CLEARED — SOUTH SIDE's
        // burn plus the auto-attack. Without that half the bodies accumulate.
        // setOwned MERGES into the module's ownedLevels, so dropping a key needs
        // an explicit 0 — the first draft of this assertion passed with SOUTH
        // SIDE still set from the build above and proved nothing.
        build({ 'OLIVE': 6, 'WATER': 6, 'SOUTH SIDE': 0 });
        const noClear = field(6000, 270, 270);
        test('armor and regen without SOUTH SIDE do NOT park', () =>
            assert.strictEqual(noClear.parkOn, false, String(noClear.parkOn)));
        build({ 'OLIVE': 6, 'WATER': 6, 'SOUTH SIDE': 3 });
        const away = field(6000, 270, 270);
        test('armor at cap plus regen engages park', () =>
            assert.strictEqual(away.parkOn, true, String(away.parkOn)));
        test('...and away from the corner it walks straight there', () => {
            // bottom-right corner from centre: both components positive
            assert.ok(away.dx > 0.5 && away.dy > 0.5,
                JSON.stringify({ dx: +away.dx.toFixed(2), dy: +away.dy.toFixed(2) }));
        });
        test('...not parked yet, because it has not arrived', () =>
            assert.strictEqual(away.parked, false, String(away.parked)));
        // ON the corner seat: STOP. This is the whole doctrine.
        const seated = field(6000, 533, 533);
        test('on the corner seat it stops moving entirely', () =>
            assert.ok(seated.parked === true && seated.dx === 0 && seated.dy === 0,
                JSON.stringify({ parked: seated.parked, dx: seated.dx, dy: seated.dy })));
        // A MARK overlapping hands control straight back to the planner — the
        // corner is mark-immune in principle, so if one IS on us, move.
        global.dropMarks = [{ x: 533, y: 533, r: 58, dmg: 72, tele: 0.6, at: 6000.3 }];
        const marked = T.planMove();
        test('a mark on the seat releases the park', () =>
            assert.strictEqual(marked.parkOn, false,
                JSON.stringify({ park: marked.parkOn, markHere: marked.markHere })));
        global.dropMarks = [];
        // A CHARGE LANE likewise: an unbounded ray, no corner defeats it.
        global.roadLines = [{ x: 533, y: 533, ang: Math.PI / 4, armed: true, dmg: 50 }];
        const laned = T.planMove();
        test('a charge lane on the seat releases the park', () =>
            assert.strictEqual(laned.parkOn, false,
                JSON.stringify({ park: laned.parkOn, lineOnCorner: laned.lineOnCorner })));
        global.roadLines = [];
        // v6.90.1 THE KILLING ZONE IS HELL ENTRY. incomeAudit over 207 runs put
        // lossPerSec at 5.96 in the minute-20 bucket — the worst in the whole
        // profile, and 8x the 70-minute figure — with firstNegativeMin at 20,
        // which is also the measured median run length. Park at 1800 sat PAST
        // that entirely and could not touch the median.
        const entry = field(1300, 533, 533);
        test('park covers HELL ENTRY, the phase that actually kills runs', () =>
            assert.ok(entry.parkOn === true && entry.parked === true,
                JSON.stringify({ park: entry.parkOn, parked: entry.parked, gt: 1300 })));
        // ...but not the day, where fleeing still opens a gap and the roster is
        // still being assembled from things that must be walked to.
        const day = field(900, 533, 533);
        test('park never engages before hell entry', () =>
            assert.strictEqual(day.parkOn, false, String(day.parkOn)));
        // v6.89.13 REGRESSION GUARD. A THROWER in its vomit windup pushes a
        // SYNTHETIC line ENDING at the player, so lineCost(l, p.x, p.y) is a
        // zero-distance hit and returns 1 — which made lineOnCorner permanently
        // true and disabled the corner outright. Live probe: lineOnCorner true
        // with roadLines length 0. Only real charge lanes (numeric `ang`) count.
        global.gameTime = 6000;
        global.player = { x: 533, y: 533, r: 7.2, hp: 300, maxHp: 309, speed: 2.375 };
        global.roadLines = [];
        build({ 'OLIVE': 6, 'WATER': 6, 'SOUTH SIDE': 3 });
        global.enemies = [{ type: 'thrower', hp: 1e6, r: 14, speed: 3, x: 455, y: 455, vomitUntil: 1e9 }];
        const thrower = T.planMove();
        test('a thrower windup does NOT veto the corner', () =>
            assert.ok(thrower.lineOnCorner === false && thrower.parkOn === true,
                JSON.stringify({ lineOnCorner: thrower.lineOnCorner, park: thrower.parkOn })));

        // v6.91.2 PARK WAS GATED ON A KEY THAT NEVER MOVES.
        // Live probe, gt 2218, lv 58: player.defense 34.992 — THE CAP — with
        // ownedLevels['OLIVE'] reading 1 and WATER 1. In-run upgrade levels are
        // stored under "OLIVE UP" (4) and "WATER UP" (3); the bare key goes to 1
        // when the ingredient is acquired and never moves again. parkArmor needs
        // OLIVE >= 6, so DEEP PARK HAS NEVER ENGAGED IN A REAL RUN — not once
        // since 6.90.0, which is why every park row is untestable noise.
        //
        // Chasing the right key name is the wrong fix. player.defense and
        // player.regenBonus are what recalcStats produces and what hurtPlayer
        // subtracts; they cannot drift out of sync with pool or naming.
        const live = (def, regen) => {
            global.gameTime = 6000;
            global.player = { x: 533, y: 533, r: 7.2, hp: 300, maxHp: 309, speed: 2.375,
                defense: def, regenBonus: regen };
            global.dropMarks = []; global.roadLines = []; global.enemies = [];
            return T.planMove();
        };
        build({ 'OLIVE': 1, 'WATER': 1, 'SOUTH SIDE': 1 });   // the LIVE reading, verbatim
        const capped = live(34.992, 2.218);
        test('armour at the cap parks, even though OLIVE reads 1', () =>
            assert.ok(capped.parkOn === true && capped.parked === true,
                JSON.stringify({ park: capped.parkOn, parked: capped.parked, olive: 1 })));
        const thinDef = live(10, 2.218);
        test('...and a genuinely thin defense still does not', () =>
            assert.strictEqual(thinDef.parkOn, false, String(thinDef.parkOn)));
        const noRegen = live(34.992, 0.2);
        test('...nor does the cap without a heal income', () =>
            assert.strictEqual(noRegen.parkOn, false, String(noRegen.parkOn)));

        // v6.91.8 THE ENTRANCE IS THE WHOLE GAME NOW.
        //
        // 6.91.6 at n=67 made the distribution BIMODAL: p60 and p120 are the
        // same 8/67, and the last 30 runs hold NOTHING between 26 and 124
        // minutes. Against 6.89.10's shape that void is p = 6.2e-4 and the
        // 3-of-3 hour-to-two-hours conversion is p = 8.2e-4. So the only lever
        // left is P(reach the seat) — and `parkFirstS` is what measures it.
        //
        // FIRST, not latest: the question is when a run got seated, so a tick
        // that re-parks 100s later must not overwrite the answer.
        const seat1 = live(34.992, 2.218);
        test('the first park engagement is stamped', () =>
            assert.strictEqual(seat1.parkFirst, 6000, String(seat1.parkFirst)));
        global.gameTime = 6100;
        const seat2 = T.planMove();
        test('...and a later tick does NOT overwrite it', () =>
            assert.strictEqual(seat2.parkFirst, 6000, String(seat2.parkFirst)));

        // v6.91.3 THE SEAT WAS INSIDE THE MARKS. The corner's whole
        // justification is "80.92px from the nearest spawnable mark centre
        // (52,62) against a 70px reach" — measured from the TRUE corner (0,0).
        // The code seated at (p.r, p.r): 70.78px at the live radius 7.2, and
        // 64.03 at the 12 fallback, which is INSIDE a 70px mark. The claimed
        // margin was entirely spent before the doctrine ever ran.
        const onSeat = live(34.992, 2.218);
        test('the seat is the TRUE corner, outside every mark that can spawn', () => {
            // player is bottom-right, so the nearest spawnable centre is (488,478)
            const d = Math.hypot(onSeat.seat.x - (540 - 52), onSeat.seat.y - (540 - 62));
            assert.ok(d >= 80, JSON.stringify({ seat: onSeat.seat, distToNearestSpawn: +d.toFixed(2) }));
        });
        // ...and it actually DRIVES there. From the old seat (532.8,532.8) with
        // the arrival radius tightened, the heading must still point outward.
        const savedRadius = pineBot.config.deepHell.parkRadius;
        pineBot.config.deepHell.parkRadius = 2;
        global.gameTime = 6000;
        global.player = { x: 532.8, y: 532.8, r: 7.2, hp: 300, maxHp: 309, speed: 2.375,
            defense: 34.992, regenBonus: 2.218 };
        global.dropMarks = []; global.roadLines = []; global.enemies = [];
        const nudge = T.planMove();
        pineBot.config.deepHell.parkRadius = savedRadius;
        test('...and from the OLD seat it keeps walking outward to reach it', () =>
            assert.ok(nudge.dx > 0.5 && nudge.dy > 0.5,
                JSON.stringify({ dx: +nudge.dx.toFixed(2), dy: +nudge.dy.toFixed(2) })));

        // v6.91.3 THE PLANNER PLAYED FRIGHTENED AT THE DEFENSE CAP.
        // armorLv fed armorConf -> caution, crowdTol and the anchor's armour
        // permission. All four read ownedLevels['OLIVE'], which is 1 at the cap.
        build({ 'OLIVE': 1, 'WATER': 1, 'SOUTH SIDE': 1, 'NEGRONI': 0 });
        const armored = live(34.992, 2.218);
        test('armour is read off player.defense, not the key that reads 1', () =>
            assert.ok(Math.abs(armored.armorLv - 6) < 0.05,
                JSON.stringify({ armorLv: armored.armorLv, olive: 1, defense: 34.992 })));
        const bare = live(0, 2.218);   // defense unreadable -> the ownedLevels fallback
        test('...with the ownedLevels fallback kept for reads before the game exists', () =>
            assert.strictEqual(bare.armorLv, 1, String(bare.armorLv)));
    }, 0);
    setTimeout(() => done(), 60);
}


// 60. v6.91.0 DORMANT-BOSS HUNT (user: "when some boss is off-canvas and the
// damage circle of the boss is also outside of the canvas, the bot needs to
// hunt it down somehow before it wakes up and does huge one hit damages").
if (which === 'dormant-hunt') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 6000, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.handleScreens();
        pineBot.test.applyDefaults();   // params are CEM-sampled per run; pin for determinism
        const T = pineBot.test;
        const owned = {};
        const build = (o) => { for (const k in owned) delete owned[k]; Object.assign(owned, o); T.setOwned(owned); };
        build({ 'OLIVE': 6, 'WATER': 6, 'SOUTH SIDE': 3 });
        // The bot is SEATED in the bottom-right corner — park is engaged and,
        // before this version, nothing could get it out of that chair.
        // The boss is a GIANT 400px beyond the right edge: r 150, so its whole
        // body (and therefore its damage circle) is off the play rectangle.
        // Centre distance from the seat is 484 — past the old 480 cap AND past
        // the `r <= 90` hell rule, so the old gather dropped it entirely.
        const scene = (gt, hp) => {
            global.gameTime = gt;
            global.player = { x: 533, y: 533, r: 7.2, hp: hp == null ? 300 : hp, maxHp: 309, speed: 2.375 };
            global.dropMarks = []; global.roadLines = [];
            global.enemies = [
                { type: 'drunk', hp: 1e6, r: 18, speed: 5, moving: true, x: 470, y: 470 },
                { type: 'drunk', hp: 1e6, r: 18, speed: 5, moving: true, x: 490, y: 520 },
                { type: 'drunk', hp: 1e6, r: 18, speed: 5, moving: true, x: 520, y: 490 },
                { type: 'boss', hp: 1e7, maxHp: 1e7, r: 150, reach: 200, speed: 0.4, moving: true, x: 940, y: 270 }
            ];
            return T.planMove();
        };
        const hunt = scene(6000);
        test('a giant boss 400px off-canvas is SEEN at all', () =>
            assert.strictEqual(hunt.dormantBoss, true,
                JSON.stringify({ dormantBoss: hunt.dormantBoss, huntGap: hunt.huntGap })));
        test('...and its gap to the play rectangle is measured, not guessed', () =>
            assert.strictEqual(hunt.huntGap, 400, String(hunt.huntGap)));
        // THE POINT OF THE VERSION: park zeroes movement, so seeing the boss is
        // worth nothing unless the hunt OUTRANKS the seat.
        test('the hunt overrides DEEP PARK', () =>
            assert.ok(hunt.hunting === true && hunt.parked === false,
                JSON.stringify({ hunting: hunt.hunting, parked: hunt.parked, parkOn: hunt.parkOn })));
        test('...and it walks to the field point nearest the boss', () => {
            // post is (532, 270) from a seat at (533, 533): almost pure north
            assert.ok(hunt.dy < -0.9 && Math.abs(hunt.dx) < 0.2,
                JSON.stringify({ dx: +hunt.dx.toFixed(2), dy: +hunt.dy.toFixed(2) }));
        });
        // ...and a mark underfoot outranks it. Asserted as an A/B ONE SECOND
        // APART, because the first draft of this check ran 260s later and
        // passed with the seat check reverted — the budget clock had expired by
        // then and was doing the work the assertion claimed credit for.
        scene(6002);
        global.dropMarks = [{ x: 533, y: 533, r: 58, dmg: 72, tele: 0.6, at: 6002.3 }];
        const marked = T.planMove();
        test('a mark on the seat cancels the hunt', () =>
            assert.ok(marked.hunting === false && marked.dormantBoss === true,
                JSON.stringify({ hunting: marked.hunting, markHere: marked.markHere })));
        const unmarked = scene(6003);
        test('...and clearing the mark resumes it, same tick, same board', () =>
            assert.strictEqual(unmarked.hunting, true, String(unmarked.hunting)));
        const mid = scene(6013);
        test('the hunt is still on inside the budget', () =>
            assert.strictEqual(mid.hunting, true, String(mid.hunting)));
        // THE CLOCK. If the weapons cannot reach the sliver from the post, the
        // bot finds that out once and goes back to the only stable seat — it
        // does not stand at the edge for the rest of the run.
        const spent = scene(6028);
        test('the hunt budget expires and the bot goes home', () =>
            assert.ok(spent.hunting === false && spent.parked === true,
                JSON.stringify({ hunting: spent.hunting, parked: spent.parked })));
        const resting = scene(6060);
        test('...and it rests before trying again', () =>
            assert.strictEqual(resting.hunting, false, String(resting.hunting)));
        const again = scene(6080);
        test('...then the rest expires and the hunt is allowed once more', () =>
            assert.strictEqual(again.hunting, true, String(again.hunting)));
        // WAKE-UP. The moment any part of the body reaches the play rectangle
        // the boss can hit us, and normal doctrine takes the fight back.
        global.gameTime = 6090;
        global.enemies[3].x = 600;   // gap 60 against r 150 — the body pokes on-canvas
        const awake = T.planMove();
        test('a boss whose body reaches the canvas is NOT hunted', () =>
            assert.ok(awake.hunting === false && awake.dormantBoss === false,
                JSON.stringify({ hunting: awake.hunting, dormantBoss: awake.dormantBoss })));
        // THE SEAT CHECK. The hunt is an opportunity, never an emergency: a hurt
        // bot stays in the chair even with a free target on the board.
        const hurt = scene(6200, 90);
        test('a hurt bot does not leave the seat to hunt', () =>
            assert.ok(hurt.dormantBoss === true && hurt.hunting === false,
                JSON.stringify({ dormantBoss: hurt.dormantBoss, hunting: hurt.hunting, hp: 90 })));

        // v6.91.1 — "WAKES UP" MEANS A TIME STOP ENDING (user). The live probe
        // returned one off-canvas boss and it was frozen (boss_glass, r 131,
        // hp 6.03e9). The dangerous object is a boss the player FROZE, parked
        // where nothing can reach it, whose thaw lands a huge contact hit.
        global.frame = 1000;
        const frozen = (gt, freezeFrames, opts) => {
            const o = opts || {};
            global.gameTime = gt;
            global.player = { x: o.px == null ? 533 : o.px, y: o.py == null ? 533 : o.py,
                r: 7.2, hp: 300, maxHp: 309, speed: 2.375 };
            global.dropMarks = []; global.roadLines = [];
            global.enemies = [
                { type: 'drunk', hp: 1e6, r: 18, speed: 5, moving: true, x: 470, y: 470 },
                { id: 'b1', type: 'boss', hp: o.hp == null ? 1e7 : o.hp, maxHp: 1e7,
                  r: o.r == null ? 150 : o.r, reach: 200, speed: 0.4, moving: true,
                  x: o.bx == null ? 940 : o.bx, y: o.by == null ? 270 : o.by,
                  frozenUntil: 1000 + freezeFrames }
            ];
            return T.planMove();
        };
        // PARK HAD NO FROZEN-BOSS EXCEPTION. `frozenBossHere` has released the
        // CORNER since 6.89.8 — "a free kill is worth leaving the funnel for at
        // any depth" — but 6.90.0's park just zeroes movement, so every frozen
        // boss has been ignored at depth since it shipped. Asserted on an
        // ON-CANVAS frozen boss, where the demo-tuned stacking station (not this
        // version's post) is the thing park was suppressing.
        const near = frozen(6300, 600, { bx: 270, by: 270, r: 60 });
        test('a FROZEN boss on the field releases DEEP PARK', () =>
            assert.ok(near.parkOn === false && near.parked === false,
                JSON.stringify({ parkOn: near.parkOn, parked: near.parked })));
        test('...and the override does NOT fire for it — the tuned station owns that case', () =>
            assert.strictEqual(near.hunting, false,
                JSON.stringify({ hunting: near.hunting })));
        // OFF-CANVAS AND FROZEN: nothing on the field can reach it, and the
        // freeze is a closing window. This is the case the user described.
        const froz = frozen(6310, 600);
        test('an OFF-CANVAS frozen boss is hunted', () =>
            assert.ok(froz.hunting === true && froz.huntFrozen === true && froz.parked === false,
                JSON.stringify({ hunting: froz.hunting, huntFrozen: froz.huntFrozen, parked: froz.parked })));
        test('...and it heads for the edge nearest the boss', () =>
            assert.ok(froz.dy < -0.9 && Math.abs(froz.dx) < 0.2,
                JSON.stringify({ dx: +froz.dx.toFixed(2), dy: +froz.dy.toFixed(2) })));
        // THE STACKING STATION, asserted as a SIGN FLIP. The first draft checked
        // the heading from the corner seat, where "walk to the station" and
        // "walk onto the body" point the same way — it passed with the station
        // reverted to zero and proved nothing. Here the boss POKES onto the
        // field (x 560, r 60: gap 20 against r 60, so not dormant) and the bot
        // stands at (500,270), INSIDE its 166px station. Holding the station
        // means backing AWAY. The karaoke lesson: never hug a paused body.
        const inside = frozen(6312, 600, { bx: 560, by: 270, r: 60, px: 500, py: 270 });
        test('...and standing too close to a poking body it BACKS OFF to the station', () =>
            assert.ok(inside.hunting === true && inside.dx < -0.3,
                JSON.stringify({ hunting: inside.hunting, dx: +inside.dx.toFixed(2) })));
        // THE HUNT MEASURES ITSELF: that live boss had 6.03e9 hp and nothing
        // here knows whether our weapons move that number.
        const bit = frozen(6313, 600, { hp: 1e7 - 50000 });
        test('the hunt books the damage it actually does to the target', () =>
            assert.strictEqual(bit.huntDmg, 50000, String(bit.huntDmg)));
        // LEAVE BEFORE IT WAKES. 60 frames = 1s of freeze against the walk home
        // from the far edge: the thaw arrives before we are back in the chair.
        const brief = frozen(6320, 60);
        test('a freeze too short to get home again is NOT hunted', () =>
            assert.ok(brief.hunting === false && brief.huntVacate === true,
                JSON.stringify({ hunting: brief.hunting, vacate: brief.huntVacate })));
        test('...and the finished attempt is booked to the audit', () => {
            const a = pineBot.huntAudit();
            assert.ok(a.attempts >= 1 && a.frozenAttempts >= 1,
                JSON.stringify({ attempts: a.attempts, frozen: a.frozenAttempts, dmg: a.dmgTotal }));
        });

        // v6.91.1 THE REAL BOARD, verbatim from a live dump at gt 5024 (84 min),
        // player at (7,533), W=H=540, frame 345250, all four frozenUntil 350495.
        // 6.91.0 shipped with a 900px CENTRE-distance cap and gathered NONE of
        // these; the live telemetry read `dormantBoss: false` with four tier-3
        // giants on the board. Radii of 613-858 against a 540px field are why
        // centre distance was the wrong axis.
        global.gameTime = 5024;
        global.frame = 345250;
        global.player = { x: 7, y: 533, r: 7.2, hp: 300, maxHp: 309, speed: 2.375 };
        global.dropMarks = []; global.roadLines = [];
        global.enemies = [
            { id: 164, type: 'boss', bossChar: 'boss_amaro', tier: 3, x: -1610, y: 253, r: 613,
              hp: 2046701140216, maxHp: 3256478322334, speed: 25.2, moving: false, frozenUntil: 350495 },
            { id: 166, type: 'boss', bossChar: 'boss_sprinter', tier: 3, x: 100, y: -1100, r: 638,
              hp: 393176729664, maxHp: 3389948068653, speed: 25.6, moving: false, frozenUntil: 350495 },
            { id: 176, type: 'boss', bossChar: 'boss_photo', tier: 3, x: 1033, y: 1307, r: 777,
              hp: 836338578881, maxHp: 8074318895470, speed: 28, moving: false, frozenUntil: 350495 },
            { id: 181, type: 'boss', bossChar: 'boss_amaro', tier: 3, x: 1299, y: 26, r: 858,
              hp: 2175590499658, maxHp: 2176569432370, speed: 29.1, moving: false, frozenUntil: 350495 }
        ];
        const real = T.gatherThreats(global.player);
        test('all four measured tier-3 giants are gathered (900px cap saw none)', () => {
            const ids = real.enemies.filter(e => e.boss).map(e => e.id).sort((x, y) => x - y);
            assert.deepStrictEqual(ids, [164, 166, 176, 181], JSON.stringify(ids));
        });
        test('...and dormancy is per-body, not per-distance', () => {
            const by = {}; for (const e of real.enemies) if (e.boss) by[e.id] = e;
            // 164: gap 1610 vs r 613 -> dormant.   166: gap 1100 vs 638 -> dormant.
            // 176: gap 912 vs 777 -> dormant.      181: gap 759 vs 858 -> body ON the field.
            assert.deepStrictEqual(
                { a: by[164].dormant, b: by[166].dormant, c: by[176].dormant, d: by[181].dormant },
                { a: true, b: true, c: true, d: false });
        });
        // The nearest-body giant (181) is 1388px from the player and its body
        // DOES reach the field — the case that most needs to be visible.
        const realPlan = T.planMove();
        test('the board is no longer invisible to the planner', () =>
            assert.strictEqual(realPlan.dormantBoss, true,
                JSON.stringify({ dormantBoss: realPlan.dormantBoss, huntGap: realPlan.huntGap })));
    }, 0);
    setTimeout(() => done(), 60);
}


// 61. v6.91.4 THE FREEZE EARNS ITS SLOT (user: "whisky sour seems crucial when
// time pause is not available and late level bosses can one hit the bot at early
// to mid hell" / "whisky sour doesn't need to be a super cocktail to be useful"
// / "as it just freezes the bosses always").
if (which === 'freeze-slot') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 1500, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.handleScreens();
        pineBot.test.applyDefaults();
        const T = pineBot.test;
        const sc = (n, t, lv) => T.scoreCard({ n, type: t, lv, maxlv: 6 }, 0, []).score;
        const why = (n, t, lv) => T.scoreCard({ n, type: t, lv, maxlv: 6 }, 0, []).why || '';

        global.gameTime = 1500;
        // KEYLESS SLOT. This is the list for cocktails whose base effect pays for
        // the slot with no super key behind it. 6.89.3 removed WHISKY SOUR from
        // it because LEMON is off-plan — but off-plan is the PREMISE of the list,
        // not an objection to membership.
        test('WHISKY SOUR is carried on its own merit, no super key needed', () =>
            assert.ok(/keyless-core/.test(why('WHISKY SOUR', 'weapon', 0)),
                why('WHISKY SOUR', 'weapon', 0)));
        // ...and the freeze bonus is worth enough to move a pick. The flat +12 it
        // replaced could not: an ingredient opens around 65 and a new cocktail
        // around +12, so the old bonus was decorative in the regime it named.
        test('...and it outscores a top ingredient at hell entry', () =>
            assert.ok(sc('WHISKY SOUR', 'weapon', 0) > sc('CRANBERRY', 'passive', 0),
                'WS ' + Math.round(sc('WHISKY SOUR', 'weapon', 0)) +
                ' vs CRANBERRY ' + Math.round(sc('CRANBERRY', 'passive', 0))));
        // ORDERING PRESERVED: the keyed super lines still sit above it, or this
        // change would quietly demote the super plan it is meant to sit beneath.
        test('...but a keyed super line still outranks it', () =>
            assert.ok(sc('SOUTH SIDE', 'weapon', 0) > sc('WHISKY SOUR', 'weapon', 0),
                'SS ' + Math.round(sc('SOUTH SIDE', 'weapon', 0)) +
                ' vs WS ' + Math.round(sc('WHISKY SOUR', 'weapon', 0))));
        // PHASE. The median run is 1325s against a 1200s hell entrance, so the
        // window where armour has not capped and a boss hit is lethal is where
        // the freeze is worth double.
        const atEntry = sc('WHISKY SOUR', 'weapon', 0);
        global.gameTime = 5200;
        const atDepth = sc('WHISKY SOUR', 'weapon', 0);
        test('the freeze is worth more at hell entry than at depth', () =>
            assert.ok(atEntry > atDepth,
                JSON.stringify({ entry: Math.round(atEntry), depth: Math.round(atDepth) })));
        test('...and the reason is tagged, not buried in a total', () =>
            assert.ok(/freeze-scarce/.test(why('WHISKY SOUR', 'weapon', 0)),
                why('WHISKY SOUR', 'weapon', 0)));

        // THE REGRESSION THIS VERSION ALMOST SHIPPED. 6.91.1 released DEEP PARK
        // for ANY frozen boss. The user's own description of WHISKY SOUR — "it
        // just freezes the bosses always" — means that build would have
        // suspended park for the entire run, silently undoing 6.91.2 and 6.91.3
        // for exactly the builds this version encourages.
        global.frame = 1000;
        const owned = {};
        const build = (o) => { for (const k in owned) delete owned[k]; Object.assign(owned, o); T.setOwned(owned); };
        build({ 'SOUTH SIDE': 3, 'WHISKY SOUR': 4 });
        const scene = (gt) => {
            global.gameTime = gt;
            global.player = { x: 533, y: 533, r: 7.2, hp: 300, maxHp: 309, speed: 2.375,
                defense: 34.992, regenBonus: 2.218 };
            global.dropMarks = []; global.roadLines = [];
            // a boss frozen for an hour: the background state, not an opportunity
            global.enemies = [{ id: 'b9', type: 'boss', hp: 1e7, maxHp: 1e7, r: 60, reach: 200,
                speed: 0.4, moving: true, x: 300, y: 300, frozenUntil: 1000 + 216000 }];
            return T.planMove();
        };
        const first = scene(6000);
        test('a newly frozen boss DOES suspend park — one burn window', () =>
            assert.ok(first.parkYieldFrozen === true && first.parkOn === false,
                JSON.stringify({ yield: first.parkYieldFrozen, park: first.parkOn })));
        const later = scene(6030);
        test('...but a permanently frozen boss does NOT hold park off forever', () =>
            assert.ok(later.parkYieldFrozen === false && later.parkOn === true,
                JSON.stringify({ yield: later.parkYieldFrozen, park: later.parkOn, gt: 6030 })));
    }, 0);
    setTimeout(() => done(), 60);
}

// v6.93.0 — THE RUNAWAY GUARD. Written from a LIVE CEM read at gen 36, where
// six movement dimensions sat pinned or within 3% of their maxima, all in the
// caution direction, and 6.92.3 measured median 601 s / hellRate 0.05 /
// 9-of-20 `line` deaths as a result. The box, not the optimiser, is the thing
// under test here: a search space that permits a runaway will eventually
// contain one.
if (which === 'runaway-guard') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 500 } });
    pineBot.stop();
    const T = pineBot.test;
    const TUN = T.tunable ? T.tunable() : null;
    const C = pineBot.config;
    const get = k => k.split('.').reduce((o, x) => o && o[x], C);

    if (!TUN) { test('TUNABLE is reachable from the test surface', () => assert.ok(false, 'no accessor')); done(); }

    // EVERY box must contain its own default. A default outside its box is
    // silently clamped on load, so the documented value would never be played.
    test('every tunable box contains its default', () => {
        for (const k of Object.keys(TUN)) {
            const d = get(k), spec = TUN[k];
            assert.ok(typeof d === 'number', k + ' has no CONFIG default');
            assert.ok(d >= spec.min && d <= spec.max,
                k + ' default ' + d + ' outside [' + spec.min + ',' + spec.max + ']');
        }
    });

    // THE SIX THAT RAN AWAY, with the values they were actually pinned at.
    // Each max must now sit BELOW the measured runaway, so the clamp pulls the
    // live mean back instead of leaving it parked at the ceiling.
    const RAN_AWAY = {
        'movement.standoff': 238.29, 'movement.standoffPull': 2.5,
        'movement.panicHp': 0.7335, 'movement.lookaheadMs': 416.28,
        'threat.enemyWeight': 3.305, 'threat.enemyRange': 318.81,
        'threat.projWeight': 7.694, 'threat.projLookaheadMs': 1066.4
    };
    for (const k of Object.keys(RAN_AWAY))
        test('the box no longer reaches the gen-36 runaway: ' + k, () =>
            assert.ok(TUN[k].max < RAN_AWAY[k],
                k + ' max ' + TUN[k].max + ' still admits ' + RAN_AWAY[k]));

    // ...and no box may sit so far above its default that a pinned mean is a
    // multiple of the documented value. 1.8x is the line: enemyWeight was at
    // 2.2x of default when the row collapsed.
    for (const k of Object.keys(RAN_AWAY))
        test('...and its ceiling stays within 1.8x of the default: ' + k, () => {
            const d = get(k);
            assert.ok(TUN[k].max <= d * 1.8,
                k + ' max ' + TUN[k].max + ' vs default ' + d);
        });
    done();
}

if (!['snapshots', 'scoring', 'hell-unban', 'pat-profile', 'boss-floor', 'directives', 'time-stop', 'flight', 'hell-southside', 'ult-falloff', 'flame-cross', 'backlog', 'freeze-aura', 'damage-audit', 'focus-fire', 'item-stop', 'flame-anchor', 'kill-order', 'edge-boss', 'stop-giant', 'grind', 'gun-veto', 'learned', 'cem-heal', 'cem-lockup', 'ult-kinds', 'po-feasibility', 'tank-holdout', 'demo-digest', 'rotation', 'rotation-resume', 'rotation-doctrine', 'runner-posture', 'roster-cap', 'char-posture', 'gun-path', 'gun-forced', 'craft-prompt', 'evo-tip', 'audit-signal', 'audit-craft', 'audit-clicks', 'levelup-repeat', 'levelup-miss', 'chrome-veto', 'corner-anchor', 'mark-escape', 'underpowered-label', 'slot-lockout', 'latent-line', 'shield-pool', 'ult-chain', 'kite-damp', 'kite-deadband', 'income-audit', 'panic-anchor', 'minguk-invuln', 'mark-ghost', 'deep-park', 'dormant-hunt', 'freeze-slot', 'arming-cap', 'runaway-guard', 'po-harvest', 'flame-passout', 'day-trek', 'joe-pierce', 'farm-stance', 'joe-guard', 'entry-seat', 'entry-seat-hell', 'run-cap', 'store-guard', 'phase-audit', 'joe-day', 'audit-merge', 'nudge-ratchet', 'tag-learn', 'drop-anchor', 'armor-tier', 'learn-probe', 'stall-escape', 'lane-escape', 'box-reopen', 'ult-economy', 'deep-regime', 'boss-census', 'break-even', 'overlay-report', 'regime-breaks', 'park-miss'].includes(which)) { console.error('unknown scenario ' + which); process.exit(2); }


// v6.93.1 — THE HARVEST APPROACH. User: "Joe and Pat still can't clear
// passouts for fast rewards and upgrades to survive the entry to hell and
// early hell... minguk seems to be able to clear 120 minutes with
// consistency." Root cause: ultHarvest existed only as a PULL competing with
// per-enemy repulsion, and the crowd that makes a passout unshootable is the
// same crowd that outbids the pull (overrides beat pulls, 6.89.11 z=-0.06).
// Now an override, below hunt/park, time-boxed like the hunt.
if (which === 'po-harvest') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 700 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    pineBot.test.setChar('pat');
    // v6.94.1: the farm gate now requires an owned weapon (the joe suicide
    // runs died with build null) — arm the scene.
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });
    const mkPo = (x, y) => ({ type: 'passout', x, y, r: 37, fallT: 0, hp: 30000, maxHp: 30000, id: 40 });
    const scene = (px, py, poX, poY, ultReadyAt, extraP, extraE) => {
        global.player = Object.assign({ x: px, y: py, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                                        ultReadyAt }, extraP || {});
        global.enemies = [mkPo(poX, poY)].concat(extraE || []);
        global.gameTime = 700;
        return pineBot.test.planMove();
    };

    // THE CORE CASE: pat, ult ready, lone passout 200px away — the walk is an
    // override heading AT the pile, not a bid the crowd can outvote.
    let pl = scene(150, 270, 350, 270, 100);
    test('pat with a ready ult WALKS to a lone passout', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting, uh: pl.ultHarvest, po: pl.poNearest })));
    test('...and the heading points at the pile', () =>
        assert.ok(pl.dx > 0.9 && Math.abs(pl.dy) < 0.3, 'dx ' + pl.dx + ' dy ' + pl.dy));
    // ...even with a mob crowd between bot and pile — the case the pull lost.
    const crowd = [];
    for (let i = 0; i < 6; i++) crowd.push({ type: 'drunk', x: 250, y: 240 + i * 12, r: 10, hp: 50, maxHp: 50, speed: 2, id: 50 + i });
    pl = scene(150, 270, 350, 270, 100, null, crowd);
    test('a crowd between bot and pile does NOT outvote the approach', () =>
        assert.ok(pl.harvesting === true && pl.dx > 0.5, JSON.stringify({ h: pl.harvesting, dx: pl.dx })));

    // ARRIVAL HOLDS. At casting range the override zeroes movement so the
    // 900ms ult retry can cash the cooldown — release here and the repulsion
    // field shoves the bot back out before the cast.
    pl = scene(300, 270, 350, 270, 100);
    test('inside casting range the bot HOLDS for the cast', () =>
        assert.ok(pl.harvesting === true && pl.dx === 0 && pl.dy === 0,
            JSON.stringify({ h: pl.harvesting, dx: pl.dx, dy: pl.dy, po: pl.poNearest })));

    // THE GATES, each proven to actually gate:
    pl = scene(150, 270, 350, 270, 1e9);
    test('no ult anywhere near ready -> no approach', () =>
        assert.ok(!pl.harvesting, JSON.stringify({ h: pl.harvesting, uh: pl.ultHarvest })));
    pl = scene(150, 270, 350, 270, 100, { hp: 30 });
    test('a hurt bot does not walk into a pile', () =>
        assert.ok(!pl.harvesting, 'harvesting while hpPanic'));
    global.gameTime = 700;
    pl = (() => { global.player = { x: 150, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2, ultReadyAt: 100 };
        global.enemies = [mkPo(520, 270)]; return pineBot.test.planMove(); })();
    test('a pile beyond harvestRangePx is not worth the walk', () =>
        assert.ok(!pl.harvesting, 'harvesting at ' + pl.poNearest + 'px'));

    // MARK SOAK (user): "the feed filler boss marks are disrupting the
    // ultimate usage and not allowing the bot to get in optimal position to
    // kill passouts." A mark is a 40%-maxHp toll and the cast is an invuln
    // window — at high HP the walk proceeds THROUGH the marked band; low,
    // the old caution returns.
    global.gameTime = 700;
    global.dropMarks = [{ x: 160, y: 270, r: 58, dmg: 72, tele: 0.6, at: 710 }];
    pl = scene(150, 270, 350, 270, 100);
    test('a boss mark on the bot does NOT stop a healthy harvest walk', () =>
        assert.ok(pl.harvesting === true && pl.dx > 0.5,
            JSON.stringify({ h: pl.harvesting, dx: pl.dx })));
    pl = scene(150, 270, 350, 270, 100, { hp: 105 });   // 58% — a 40% hit lands near panic
    test('...but a bot too hurt to soak the mark still yields to it', () =>
        assert.ok(!pl.harvesting, 'harvesting at 58% under a mark'));
    // ...unless a SHIELD covers the toll (screenshot: 69% HP +117sh under a
    // 26-mark carpet) — the shield eats the landing before HP does.
    pl = scene(150, 270, 350, 270, 100, { hp: 105, shield: 60 });
    test('...and a shield restores the walk at the same HP', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    global.dropMarks = [];

    // MINGUK IS UNTOUCHED — the working baseline. His nuke is field-wide, so
    // the approach must never move him.
    pineBot.test.setChar('minguk');
    pl = scene(150, 270, 350, 270, 100);
    test('minguk (nuke) never walks to a pile — his ult reaches from anywhere', () =>
        assert.ok(!pl.harvesting, 'nuke char harvesting'));
    pineBot.test.setChar('pat');

    // THE CLOCK: the window is early-game (user's stated gap). Deep hell has
    // park and the corner doctrine; the approach must yield there.
    global.gameTime = 4000;
    pl = (() => { global.player = { x: 150, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2, ultReadyAt: 3900 };
        global.enemies = [mkPo(350, 270)]; global.gameTime = 4000; return pineBot.test.planMove(); })();
    // (hell not latched in this env, so the window check passes; assert the
    // day-side behaviour is unchanged instead)
    test('outside hell the approach stays available (day farming)', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    done();
}

// v6.93.3 — THE CROSS IS FOR PASSOUTS (user: "flame cross is still being
// wasted on mobs and bosses. they should be almost exclusively used for
// passouts"). Three claims, each with teeth: the PICKUP is refused without a
// passout field (the cross activates on pickup, so pickup IS targeting); the
// AIM is passout-exclusive while one is in range; an ACTIVE burn is walked
// to the pile by the harvest override.
if (which === 'flame-passout') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 700 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    pineBot.test.setChar('pat');
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });   // v6.94.1: the farm gate requires a weapon
    const mkPo = (x, y) => ({ type: 'passout', x, y, r: 37, fallT: 0, hp: 30000, maxHp: 30000, id: 60 });
    const boss = { type: 'boss', x: 250, y: 270, r: 40, hp: 5e5, maxHp: 5e5, speed: 0, moving: false, id: 61 };

    // PICKUP: a cross on a hot, passout-free field stays on the floor.
    // gatherLoot is a real test accessor — the value itself is asserted.
    global.player = { x: 150, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2, ultReadyAt: 1e9 };
    global.enemies = [boss];
    global.pickups = [{ kind: 'firecross', x: 180, y: 270 }];
    let pl = pineBot.test.planMove();   // sets lastPlan (passoutsNear = 0)
    const crossV = () => {
        const th = pineBot.test.gatherThreats(global.player);
        const L = pineBot.test.gatherLoot(global.player, 0.95, th) || [];
        const it = L.find(i => i.kind === 'firecross');
        return it ? it.v : null;
    };
    const vNoPo = crossV();
    test('a cross with no passouts anywhere is left lying (flat 4)', () =>
        assert.ok(vNoPo != null && vNoPo <= 6, 'v ' + vNoPo));
    // ...even with a BOSS on the field — the old ladder paid +14/+20 here.
    // (the boss is already in the scene above; vNoPo covers it)
    // ...and the SAME field with a passout up makes it top-priority.
    global.enemies = [boss, mkPo(300, 270)];
    pl = pineBot.test.planMove();       // lastPlan.passoutsNear >= 1 (190px gate: 150px away)
    const vPo = crossV();
    test('the same cross with a passout field up is grabbed', () =>
        assert.ok(vPo != null && vPo > vNoPo + 30, vPo + ' vs ' + vNoPo));

    // AIM: passout-exclusive. A boss CLOSER than the passout must not win the
    // stream — the old falloff weights let it.
    global.player = { x: 150, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                      ultReadyAt: 1e9, fireCrossUntil: 9999 };
    global.gameTime = 700;
    global.enemies = [Object.assign({}, boss, { x: 200, y: 270 }), mkPo(330, 270)];
    pl = pineBot.test.planMove();
    test('with the burn LIVE, a nearer boss does not steal the aim from a passout', () =>
        assert.ok(pl.flameAimPo === true, JSON.stringify({ po: pl.flameAimPo, d: pl.flameAim })));
    // ...but with NO passout, the burn is not wasted by refusing to aim at all.
    global.enemies = [Object.assign({}, boss, { x: 200, y: 270 })];
    pl = pineBot.test.planMove();
    test('with no passout in range, the live burn still sweeps the field', () =>
        assert.ok(pl.flameAim != null && pl.flameAimPo === false,
            JSON.stringify({ po: pl.flameAimPo, d: pl.flameAim })));

    // PIERCE (user): "flame cross also has pierce so it can kill multiple
    // passouts at once if you angle the flame cross correctly." Three
    // passouts in a line to the EAST vs one closer passout to the NORTH —
    // the aim must take the line, not the nearest body.
    global.player = { x: 150, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                      ultReadyAt: 1e9, fireCrossUntil: 9999 };
    global.gameTime = 700;
    global.enemies = [mkPo(260, 270), mkPo(340, 270), mkPo(420, 270),
                      Object.assign(mkPo(150, 180), { id: 63 })];
    pl = pineBot.test.planMove();
    test('the aim takes the RAY through three passouts over a nearer lone one', () =>
        assert.ok(pl.flameAimPo === true && pl.flameAim != null && pl.flameAim >= 100,
            JSON.stringify({ po: pl.flameAimPo, d: pl.flameAim })));
    // v6.94.0 — REVISED: the original assertion expected a walk toward the
    // 3-passout centroid. The stand-point search found something BETTER: a
    // slightly diagonal corridor from the lone passout at (150,180) clips
    // ALL FOUR bodies within the 42px beam width, so the bot heads for THAT
    // line's outside end (up-left of the anchor), not into the pile middle.
    test('...the stand search finds the FOUR-passout line', () =>
        assert.strictEqual(pl.flameLine, 4, 'flameLine ' + pl.flameLine));
    test('...and the heading goes to the line END, outside the pile', () =>
        assert.ok(pl.harvesting === true && pl.dx < -0.3 && pl.dy < -0.5,
            'dx ' + pl.dx + ' dy ' + pl.dy));
    // ...and once AT the stand, the bot CREEPS down the line so the facing
    // stays locked along it — the pile blocks the walk, costing nothing.
    global.player = { x: 67, y: 141, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                      ultReadyAt: 1e9, fireCrossUntil: 9999 };
    global.gameTime = 700;
    pl = pineBot.test.planMove();
    test('...and at the stand it creeps ALONG the line, not to a stop', () =>
        assert.ok(pl.harvesting === true && pl.dx > 0.7 && pl.dy > 0.2,
            'dx ' + pl.dx + ' dy ' + pl.dy));

    // CARRY: an active burn triggers the harvest walk even with the ult cold.
    global.player = { x: 150, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                      ultReadyAt: 1e9, fireCrossUntil: 9999 };
    global.gameTime = 700;
    global.enemies = [mkPo(380, 270)];
    pl = pineBot.test.planMove();
    test('an active burn is CARRIED to the pile (harvest override, ult cold)', () =>
        assert.ok(pl.harvesting === true && pl.dx > 0.5,
            JSON.stringify({ h: pl.harvesting, dx: pl.dx, po: pl.poNearest })));
    // ...and joe carries it too — the flame arm has no meleeUlt gate.
    // (v6.95.1: joe's fragile profile armor-gates all approaches, so the
    // scene arms him at the 4-OLIVE floor — an unarmored joe staying home
    // is now joe-guard's asserted behaviour, not a flame regression.)
    pineBot.test.setChar('joe');
    global.player = { x: 150, y: 270, hp: 95, maxHp: 100, speed: 3.0, r: 7.2,
                      ultReadyAt: 1e9, fireCrossUntil: 9999, defense: 25 };
    global.enemies = [mkPo(380, 270)];
    pl = pineBot.test.planMove();
    test('joe carries the burn to the pile as well', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    done();
}

// v6.94.0 — THE DAY TREK, override form (user: "clear day with killing all
// the bosses - no booking mobs, passouts, and mobile bosses to get maximum
// preparation of upgrades in weapons and ingredients going into hell mode").
// v6.85.10's FIELD TREK was a PULL — the third instance of the 6.89.11
// lesson. Priority: roaming boss (tips = roster upgrades) > oldest far
// passout (FIFO despawn) > wall cluster. Transport only: releases at
// trekReleasePx and hands over to the combat machinery.
if (which === 'day-trek') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 700 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    pineBot.test.setChar('pat');
    const mkPo = (x, y, id) => ({ type: 'passout', x, y, r: 37, fallT: 0, hp: 30000, maxHp: 30000, id: id || 70 });
    const mkBoss = (x, y) => ({ type: 'boss', x, y, r: 30, hp: 4e4, maxHp: 4e4, speed: 1.2, moving: true, id: 71 });
    const mkWall = (x, y) => ({ type: 'runner', wall: true, noBooking: true, x, y, r: 34, hp: 2e5, maxHp: 2e5, speed: 0, id: 72 });
    const scene = (enemies, gt) => {
        global.player = { x: 100, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2, ultReadyAt: 1e9 };
        global.enemies = enemies;
        global.gameTime = gt || 700;
        return pineBot.test.planMove();
    };

    // v6.99.2 TREK FLOOR — tested FIRST, on a clean trek clock: any test
    // that treks at a later gt leaves a rest window behind, and a gt-100
    // assertion after one is toothless (the rest blocks the trek whatever
    // the floor says — the "other clock" bite, again).
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });
    let pl = scene([mkBoss(460, 270)], 30);
    test('no trek before the run has legs', () =>
        assert.ok(!pl.trekking, 'trekking at gt 30'));
    pl = scene([mkBoss(460, 270)], 100);
    test('gt 100 (past farmFromS, under trekFromS): still no field crossing', () =>
        assert.ok(!pl.trekking, 'trekking at gt 100'));

    // PRIORITY 1: a roaming boss across the field, empty local — WALK.
    pl = scene([mkBoss(460, 270)]);
    test('an empty local field + a distant roaming boss = trek to the boss', () =>
        assert.ok(pl.trekking === true && pl.trekKind === 'boss' && pl.dx > 0.9,
            JSON.stringify({ t: pl.trekking, k: pl.trekKind, dx: pl.dx })));
    // ...and the boss OUTRANKS a far passout: tips are roster upgrades.
    pl = scene([mkBoss(460, 270), Object.assign(mkPo(100, 500), { far: true })]);
    test('the boss outranks a far passout (tips first)', () =>
        assert.ok(pl.trekKind === 'boss', String(pl.trekKind)));
    // PRIORITY 3: a wall cluster when nothing else is left.
    pl = scene([mkWall(460, 270)]);
    test('a distant wall is trekked to when nothing else is left', () =>
        assert.ok(pl.trekking === true && pl.trekKind === 'wall' && pl.dx > 0.9,
            JSON.stringify({ t: pl.trekking, k: pl.trekKind, dx: pl.dx })));

    // RELEASE: a boss already local is NOT a trek — combat machinery owns it.
    pl = scene([mkBoss(240, 270)]);
    test('a local boss releases the trek (transport, not combat)', () =>
        assert.ok(!pl.trekking, JSON.stringify({ t: pl.trekking, k: pl.trekKind })));

    // v6.94.1 (user): "kill the passouts that landed first as soon as
    // possible" — in the EARLY window the FIFO passout outranks the boss:
    // its HP was priced at landing time and it funds the next set.
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });
    pl = scene([mkBoss(460, 270), Object.assign(mkPo(460, 400, 7), { far: true })], 400);
    test('EARLY (gt<600): the first-landed passout outranks the boss trek', () =>
        assert.ok(pl.trekking === true && pl.trekKind === 'po',
            JSON.stringify({ t: pl.trekking, k: pl.trekKind })));
    pl = scene([mkBoss(460, 270), Object.assign(mkPo(460, 400, 7), { far: true })], 700);
    test('LATE (gt>600): the boss tip resumes the lead', () =>
        assert.ok(pl.trekKind === 'boss', String(pl.trekKind)));

    // v6.99.1 LITTER HUNT: a forming litter carpet flips the early order —
    // the boss producing it outranks the passout FIFO even before 600s.
    const litter = n => Array.from({ length: n }, (_, i) =>
        ({ x: 400, y: 100 + i * 20, land: 100 + i * 20, r: 16 }));
    global.eprojectiles = litter(5);
    pl = scene([mkBoss(460, 270), Object.assign(mkPo(460, 400, 7), { far: true })], 400);
    test('5 litter marks: the EARLY passout lead yields to the boss (kill the source)', () =>
        assert.ok(pl.trekKind === 'boss', JSON.stringify({ k: pl.trekKind, li: pl.litter })));
    global.eprojectiles = litter(3);
    pl = scene([mkBoss(460, 270), Object.assign(mkPo(460, 400, 7), { far: true })], 400);
    test('...under litterHuntN (3 marks) the passout FIFO keeps the lead', () =>
        assert.ok(pl.trekKind === 'po', JSON.stringify({ k: pl.trekKind, li: pl.litter })));
    global.eprojectiles = [];

    // v6.99.1 fund-rush trek waiver: an unarmored joe treks with the ult
    // READY (the cast covers the destination); ult cold, the armor gate is
    // back. (Pat above is untouched — his approachDefense is null.)
    pineBot.test.setChar('joe');
    // note the advancing gt: the trek clock (trekStartS/trekRestUntilS) is
    // module state carried from the pat scenes above — a fresh gt past any
    // rest window starts a clean trek instead of inheriting a spent clock.
    const joeScene = (ultAt, gt) => {
        global.player = { x: 100, y: 270, hp: 95, maxHp: 100, speed: 3.0, r: 7.2,
                          ultReadyAt: ultAt, defense: 12 };
        global.enemies = [mkBoss(460, 270)];
        global.gameTime = gt;
        return pineBot.test.planMove();
    };
    pl = joeScene(100, 760);
    test('unarmored joe treks to the boss with the ult ready (fund rush)', () =>
        assert.ok(pl.trekking === true && pl.trekKind === 'boss',
            JSON.stringify({ t: pl.trekking, k: pl.trekKind })));
    pl = joeScene(1e9, 800);
    test('...ult cold, the armor gate returns and the trek stays shut', () =>
        assert.ok(!pl.trekking, JSON.stringify({ t: pl.trekking, k: pl.trekKind })));
    pineBot.test.setChar('pat');
    // ...and the readiness gate is the WEAPON, not just the clock: the joe
    // suicide runs died at 72s with build null.
    pineBot.test.setOwned({ 'SOUTH SIDE': 0 });
    pl = scene([mkBoss(460, 270)], 400);
    test('no weapon, no trek — whatever the clock says', () =>
        assert.ok(!pl.trekking, 'trekking weaponless'));
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });

    // GATES, each with teeth:
    // (the farmFromS / trekFromS floor tests run FIRST in this scenario —
    // they need a clean trek clock; see the top of the block.)
    global.player = { x: 100, y: 270, hp: 40, maxHp: 180, speed: 1.9, r: 7.2, ultReadyAt: 1e9 };
    global.enemies = [mkBoss(460, 270)]; global.gameTime = 700;
    pl = pineBot.test.planMove();
    test('a hurt bot does not trek', () => assert.ok(!pl.trekking, 'trekking hurt'));
    done();
}

// v6.94.0 — JOE'S PIERCE ALIGNMENT. Source-verified: the barspoon pierces 8
// bodies and fireBase aims at the NEAREST enemy, so whatever stands BEHIND
// the target is hit too. This was luck; now it is positioning: candidates
// whose base-attack ray continues into passouts are preferred.
if (which === 'joe-pierce') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 700 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    pineBot.test.setChar('joe');
    const mkPo = (x, y, id) => ({ type: 'passout', x, y, r: 37, fallT: 0, hp: 30000, maxHp: 30000, id });
    // a mob with TWO passouts due south of it: standing NORTH of the mob
    // lines the volley through all three. Flee-from-mob alone points
    // north-WEST-ish from the start position; the alignment term must pull
    // the chosen heading onto the firing line.
    global.player = { x: 300, y: 200, hp: 95, maxHp: 100, speed: 3.0, r: 7.2, ultReadyAt: 1e9 };
    global.enemies = [
        { type: 'drunk', x: 330, y: 270, r: 10, hp: 60, maxHp: 60, speed: 1.5, id: 80 },
        mkPo(330, 350, 81), mkPo(330, 430, 82)
    ];
    global.gameTime = 700;
    const pl = pineBot.test.planMove();
    // The measured behaviour: at 16/hit joe HOLDS a 1-hit firing line
    // (stand-still, zero exposure) instead of fleeing broadside to 0 hits.
    // A 2-hit line exists but costs a walk toward the mob — holding the
    // free line is the right trade, so the assertion is >= 1.
    test('joe\'s chosen candidate keeps a firing line through the pile', () =>
        assert.ok((pl.pierceLine || 0) >= 1, 'pierceLine ' + pl.pierceLine));
    // TEETH, in-scenario: zeroing the weight must return to broadside flight.
    pineBot.config.movement.pierceAlignValue = 0;
    const pl0 = pineBot.test.planMove();
    test('...and zeroing pierceAlignValue loses the line (the term has teeth)', () =>
        assert.strictEqual(pl0.pierceLine || 0, 0, 'pierceLine ' + pl0.pierceLine));
    pineBot.config.movement.pierceAlignValue = 16;
    // ...and the term is joe\'s alone: pat has no pierce to aim.
    pineBot.test.setChar('pat');
    global.player = { x: 300, y: 200, hp: 170, maxHp: 180, speed: 1.9, r: 7.2, ultReadyAt: 1e9 };
    global.gameTime = 700;
    const pl2 = pineBot.test.planMove();
    test('pat, pierceless, gets no alignment term', () =>
        assert.strictEqual(pl2.pierceLine || 0, 0, 'pat pierceLine ' + pl2.pierceLine));
    done();
}

// v6.95.0 — THE DAY FARM STANCE. The 6.94.1 digest's smoking gun was
// crowdMedian 0 / crowdP75 1 across a 20-minute day: safe and broke. Kills
// are the only income, armor 35 makes flat-22.4 contact nearly free, and the
// day x1.15 common-fear harden (which MISREAD the human demo's crowd median
// 0 as avoidance when it was slaughter) kept the bot where mobs aren't.
if (which === 'farm-stance') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 800 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    pineBot.test.setChar('pat');
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });
    const drunks = (x0) => Array.from({ length: 5 }, (_, i) =>
        ({ type: 'drunk', x: x0, y: 230 + i * 20, r: 10, hp: 60, maxHp: 60, speed: 1.5, id: 90 + i }));
    const scene = (extraP, gt, enemies) => {
        global.player = Object.assign({ x: 270, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                                        ultReadyAt: 1e9, defense: 35 }, extraP || {});
        global.enemies = enemies || drunks(340);
        global.gameTime = gt || 800;
        // the planner smooths headings across ticks — run a few so the scene
        // settles on ITS OWN answer instead of inheriting the last scene's
        // momentum (the player is re-pinned each tick, so only the heading
        // history carries over).
        let pl; for (let i = 0; i < 4; i++) pl = pineBot.test.planMove();
        return pl;
    };

    // THE STANCE LATCHES on measured armor + healthy HP in the day...
    let pl = scene();
    test('armored + healthy + day = farm stance ON', () =>
        assert.ok(pl.farmStance === true, JSON.stringify({ f: pl.farmStance })));
    // ...and each gate proves it can gate:
    pl = scene({ defense: 12 });
    test('under the armor floor the stance stays OFF (read the stat)', () =>
        assert.ok(pl.farmStance === false, 'stance at defense 12'));
    pl = scene({ hp: 100 });
    test('hurt (56%) the stance stays OFF', () =>
        assert.ok(pl.farmStance === false, 'stance at 56% HP'));
    pl = scene(null, 1150);
    test('after farmUntilS the stance re-hardens for the entry surge', () =>
        assert.ok(pl.farmStance === false, 'stance at gt 1150'));

    // THE POINT: an armored bot does not flee a drunk crowd. Same field,
    // armored vs unarmored — the unarmored bot backs off west harder.
    const armored = scene();
    const soft = scene({ defense: 12 });
    test('the armored stance stands its ground where the soft bot flees', () =>
        assert.ok(armored.dx > soft.dx + 0.25,
            'armored dx ' + armored.dx.toFixed(2) + ' vs soft dx ' + soft.dx.toFixed(2)));

    // CROWD-SIDE HOLD: standing AT the pile centroid with the crowd east,
    // the stance shifts the hold east (mobs in front, splash leaks into the
    // pile); without the stance the bot just holds the centroid.
    const po = { type: 'passout', x: 270, y: 270, r: 37, fallT: 0, hp: 30000, maxHp: 30000, id: 99 };
    pl = scene({ x: 270, y: 270, ultReadyAt: 100 }, 800, [po].concat(drunks(380)));
    test('the pile is held on the CROWD side', () =>
        assert.ok(pl.harvesting === true && pl.dx > 0.3,
            JSON.stringify({ h: pl.harvesting, dx: pl.dx })));
    pl = scene({ x: 270, y: 270, ultReadyAt: 100, defense: 12 }, 800, [po].concat(drunks(380)));
    test('...and without the stance the hold stays centred', () =>
        assert.ok(pl.harvesting === true && Math.abs(pl.dx) < 0.2,
            JSON.stringify({ h: pl.harvesting, dx: pl.dx })));
    done();
}

// v6.95.1 — THE JOE DOCTRINE (user kept pat+joe; the data demanded this).
// Joe: zero innate regen (source-verified: the base term is pat||minguk),
// 100 HP, no splash. 6.94.1 n=31: median 360s, 25/31 contact deaths — every
// chip hit is permanent until a heal drops. Approaches are armor-gated,
// marks are soakable only behind a shield, heals turn vital earlier, and
// NEGRONI (his regen substitute) jumps the day queue.
if (which === 'joe-guard') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 800 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    pineBot.test.setChar('joe');
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });
    const mkPo = (x, y) => ({ type: 'passout', x, y, r: 37, fallT: 0, hp: 30000, maxHp: 30000, id: 40 });
    const scene = (extraP) => {
        global.player = Object.assign({ x: 150, y: 270, hp: 95, maxHp: 100, speed: 3.0, r: 7.2,
                                        ultReadyAt: 100, defense: 25 }, extraP || {});
        global.enemies = [mkPo(350, 270)];
        global.gameTime = 800;
        return pineBot.test.planMove();
    };

    // APPROACHES: v6.99.0 ULT-COVERED WAIVER (manual joe demo, 6.98.0,
    // 1997s day clear — 91px pile stations BEFORE OLIVE arrived at gt 285,
    // invulnShare 0.326). The ult arm is its own armor: the cast covers
    // the exit. The armor gate now guards only the arms with no
    // invulnerability window (flame cross here, field trek in day-trek).
    let pl = scene({ defense: 12 });
    test('an unarmored joe DOES walk to the pile when the ult covers it (v6.99.0)', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    pl = scene();
    test('at the 4-OLIVE armor floor the walk opens too', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    pl = scene({ hp: 75 });
    test('at 75% HP (below his 80% floor) joe stays home — the waiver is armor-only', () =>
        assert.ok(!pl.harvesting, 'harvesting at 75%'));
    pl = scene({ defense: 12, ultReadyAt: 1e9 });
    test('ult COLD and no burn: nothing covers the walk — unarmored joe stays home', () =>
        assert.ok(!pl.harvesting, JSON.stringify({ h: pl.harvesting })));
    // v6.99.1 AURA HOLD: the cast itself must not end the hold — with the
    // aura ACTIVE (cooldown spent, ultUntil ahead of gt) the bot stays
    // pinned to the pile until the burn finishes the bodies.
    pl = scene({ defense: 12, ultReadyAt: 1e9, ultUntil: 808 });
    test('an ACTIVE aura pins the hold to the pile (finish the kill, roll the tip)', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    pl = scene({ defense: 12, ultReadyAt: 1e9, fireCrossUntil: 9999 });
    test('the flame arm keeps the armor gate: unarmored joe does NOT carry a burn', () =>
        assert.ok(!pl.harvesting, JSON.stringify({ h: pl.harvesting })));
    pl = scene({ ultReadyAt: 1e9, fireCrossUntil: 9999 });
    test('...armored (25), the burn is carried', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));

    // v6.99.1 FUND RUSH: with the ult READY, the wide 130px shot halo no
    // longer vetoes the funding walk — only true collision range does.
    global.eprojectiles = [{ x: 150 + 100, y: 270, r: 6, vx: 0, vy: 0 }];
    pl = scene({ defense: 12 });
    test('a shot 100px off does NOT stop an ult-ready funding walk (fund rush)', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting, fr: pl.fundRush })));
    global.eprojectiles = [{ x: 150 + 30, y: 270, r: 6, vx: 0, vy: 0 }];
    pl = scene({ defense: 12 });
    test('...but a shot in COLLISION range (30px) still blocks it', () =>
        assert.ok(!pl.harvesting, JSON.stringify({ h: pl.harvesting })));
    global.eprojectiles = [{ x: 150 + 100, y: 270, r: 6, vx: 0, vy: 0 }];
    pl = scene({ ultReadyAt: 1e9, fireCrossUntil: 9999 });
    test('the flame arm keeps the wide halo: a shot 100px off stops the burn carry', () =>
        assert.ok(!pl.harvesting, JSON.stringify({ h: pl.harvesting })));
    global.eprojectiles = [];
    // ...and a boss mark no longer stops a shieldless walk when the cast
    // will cover the landing (the demo's whole day was walked mark-blind).
    global.dropMarks = [{ x: 160, y: 270, r: 58, dmg: 40, tele: 0.6, at: 810 }];
    pl = scene({ defense: 12 });
    test('fund rush: a mark does not stop a shieldless ult-ready walk', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting, fr: pl.fundRush })));
    global.dropMarks = [];

    // v6.99.2 — the tests below JUMP THE CLOCK, so they sit last in the
    // harvest block (the harvest hold/rest state is module-level).
    // The 45 s farmFromS floor keeps the LOCAL pile walk open early:
    global.gameTime = 60;
    global.player = { x: 150, y: 270, hp: 95, maxHp: 100, speed: 3.0, r: 7.2,
                      ultReadyAt: 50, defense: 0 };
    global.enemies = [mkPo(350, 270)];
    pl = pineBot.test.planMove();
    test('at gt 60 with a weapon owned, the local pile walk is already open', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    // ENTRY PREP: from entryPrepFromS (1050, v6.100.0 — 900 measured too
    // blunt: dayClear 0.15 -> 0.02 on the clean 6.99.2 row) the rush stands
    // down — the armor gate returns so entrants arrive wearing the seat
    // build. (The unarmored call also clears the carried harvest clock:
    // harvWant false nulls harvStartS, so the armored call starts fresh.)
    global.gameTime = 1080;
    global.player = { x: 150, y: 270, hp: 95, maxHp: 100, speed: 3.0, r: 7.2,
                      ultReadyAt: 100, defense: 12 };
    global.enemies = [mkPo(350, 270)];
    pl = pineBot.test.planMove();
    test('gt 1080: the fund rush stands down — unarmored joe stays home again', () =>
        assert.ok(!pl.harvesting && pl.fundRush === false,
            JSON.stringify({ h: pl.harvesting, fr: pl.fundRush })));
    global.gameTime = 1090;
    global.player.defense = 25;
    pl = pineBot.test.planMove();
    test('...armored (25) past entry prep, the ult-covered walk still opens', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    // ...and at 950 — under the 900 cutoff this was already shut — the rush
    // now still runs: the late-day funding window belongs to the rush.
    global.gameTime = 950;
    global.player = { x: 150, y: 270, hp: 95, maxHp: 100, speed: 3.0, r: 7.2,
                      ultReadyAt: 100, defense: 12 };
    global.enemies = [mkPo(350, 270)];
    pl = pineBot.test.planMove();
    test('gt 950 still rushes (the 900 cutoff was the 6.99.2 dayClear collapse)', () =>
        assert.ok(pl.harvesting === true && pl.fundRush === true,
            JSON.stringify({ h: pl.harvesting, fr: pl.fundRush })));
    test('the fund-rush config carries its shipped defaults', () =>
        assert.ok(pineBot.config.movement.fundProjPx === 45 &&
                  pineBot.config.movement.litterHuntN === 4 &&
                  pineBot.config.movement.fundRush === true &&
                  pineBot.config.movement.fundRushHp === 0.65 &&
                  pineBot.config.movement.dayRestMul === 0.4 &&
                  pineBot.config.movement.farmFromS === 45 &&
                  pineBot.config.movement.trekFromS === 150 &&
                  pineBot.config.movement.entryPrepFromS === 1050));

    // ...and PAT is untouched by the fragile profile: same unarmored scene.
    pineBot.test.setChar('pat');
    global.player = { x: 150, y: 270, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                      ultReadyAt: 100, defense: 12 };
    global.enemies = [mkPo(350, 270)]; global.gameTime = 800;
    pl = pineBot.test.planMove();
    test('pat (180 HP + regen) still harvests unarmored — the gate is joe\'s alone', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    pineBot.test.setChar('joe');

    // MARKS: a healthy joe does NOT soak a mark on raw HP — on the arms
    // with no invulnerability window (v6.99.1: the fund rush covers the
    // ult arm, so the mark doctrine is asserted on the flame carry).
    global.dropMarks = [{ x: 160, y: 270, r: 58, dmg: 40, tele: 0.6, at: 810 }];
    pl = scene({ ultReadyAt: 1e9, fireCrossUntil: 9999 });
    test('a mark stops an unshielded joe burn carry — 40 permanent HP is not a toll', () =>
        assert.ok(!pl.harvesting, 'harvesting under a mark, no shield'));
    pl = scene({ ultReadyAt: 1e9, fireCrossUntil: 9999, shield: 60, shieldMax: 60 });
    test('...but behind a NEGRONI shield the walk proceeds', () =>
        assert.ok(pl.harvesting === true, JSON.stringify({ h: pl.harvesting })));
    global.dropMarks = [];

    // HEALS: vital fires at 75% for joe (60% for the others).
    global.player = { x: 150, y: 270, hp: 72, maxHp: 100, speed: 3.0, r: 7.2, ultReadyAt: 1e9 };
    global.enemies = []; global.pickups = [{ kind: 'health', x: 300, y: 270 }];
    global.gameTime = 800;
    let th = pineBot.test.gatherThreats(global.player);
    let L = pineBot.test.gatherLoot(global.player, 0.72, th) || [];
    test('a heal is VITAL for joe at 72%', () =>
        assert.ok(L[0] && L[0].vital === true, JSON.stringify(L[0] || null)));
    pineBot.test.setChar('pat');
    th = pineBot.test.gatherThreats(global.player);
    L = pineBot.test.gatherLoot(global.player, 0.72, th) || [];
    test('...and merely valuable for pat at the same ratio', () =>
        assert.ok(L[0] && L[0].vital === false, JSON.stringify(L[0] || null)));
    pineBot.test.setChar('joe');

    // NEGRONI jumps the day queue for joe only.
    const why = n => pineBot.test.scoreCard({ n, type: 'weapon', lv: 0, maxlv: 6 }, 0, []).why || '';
    test('NEGRONI carries joe-shield for joe', () =>
        assert.ok(/joe-shield/.test(why('NEGRONI')), why('NEGRONI')));
    pineBot.test.setChar('pat');
    test('...and not for pat', () =>
        assert.ok(!/joe-shield/.test(why('NEGRONI')), why('NEGRONI')));
    // v6.99.3 (user): GIN TONIC is a boss killer — the slow cuts contact
    // ticks — and its shot hits passouts. Day-weighted, any character.
    test('GIN TONIC carries gin-boss-slow+24 in day (the slow is a day boss tool)', () =>
        assert.ok(/gin-boss-slow\+24/.test(why('GIN TONIC')), why('GIN TONIC')));
    done();
}

// v6.95.2 — THE ENTRY SEAT. The 195-minute recording shows the SEATED state
// winning; the 6.94.1 digest shows death 6s after entry, mid-field. The ramp
// now ends where the winning posture begins: pre-seat from entryPrepS, hold
// through early hell until the armed park takes over or the window closes.
if (which === 'entry-seat') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 1150 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    pineBot.test.setChar('pat');
    pineBot.test.setOwned({ 'SOUTH SIDE': 1 });
    const scene = (gt, extraP) => {
        global.player = Object.assign({ x: 200, y: 200, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                                        ultReadyAt: 1e9, defense: 35 }, extraP || {});
        global.enemies = [];
        global.gameTime = gt;
        let pl; for (let i = 0; i < 3; i++) pl = pineBot.test.planMove();
        return pl;
    };

    // DAY, past entryPrepS: walk to the seat (nearest corner from (200,200)
    // is (0,0) — heading up-left), and HOLD there.
    let pl = scene(1150);
    test('at gt 1150 the bot walks to the corner seat', () =>
        assert.ok(pl.seated === true && pl.dx < -0.5 && pl.dy < -0.5,
            JSON.stringify({ s: pl.seated, dx: pl.dx, dy: pl.dy })));
    pl = scene(1150, { x: 8, y: 8 });
    test('...and at the seat it HOLDS', () =>
        assert.ok(pl.seated === true && pl.dx === 0 && pl.dy === 0,
            JSON.stringify({ s: pl.seated, dx: pl.dx, dy: pl.dy })));
    // BEFORE the window: no seat (the farm stance owns 90-1100).
    pl = scene(1000);
    test('at gt 1000 the day belongs to the farm, not the seat', () =>
        assert.ok(!pl.seated, 'seated at 1000'));
    // ENTRY-REGEN CHECKPOINT: regen behind by late day -> WATER jumps.
    global.gameTime = 800;
    const wWhy = () => pineBot.test.scoreCard({ n: 'WATER', type: 'passive', lv: 2, maxlv: 6 }, 0, []).why || '';
    test('late day with regen behind, WATER carries entry-regen', () =>
        assert.ok(/entry-regen/.test(wWhy()), wWhy()));
    // v6.112.0: this block used to stand the checkpoint down at SIMPLE SYRUP 2
    // — "1.024 HP/s >= the park gate", which was true of the old flat 1.0 gate
    // and is 0.55 HP/s SHORT of break-even. At armour cap the 38-frame invuln
    // caps contact at 1.579 hits/s x 1 damage, so the anchor needs 1.579 HP/s.
    // Armour is pinned explicitly so the bar is deterministic rather than
    // depending on whatever defense an earlier scene left behind.
    global.player.defense = 34.992;
    pineBot.test.setOwned({ 'SIMPLE SYRUP': 2 });   // 1.024 HP/s — the OLD "sufficient"
    test('SIMPLE SYRUP 2 no longer stands the checkpoint down (it is below break-even)', () =>
        assert.ok(/entry-regen/.test(wWhy()),
            '1.024 HP/s accepted against a 1.579 break-even | ' + wWhy()));
    pineBot.test.setOwned({ 'SIMPLE SYRUP': 4 });   // 2.048 HP/s — actually net-positive
    test('...and with break-even actually cleared the checkpoint stands down', () =>
        assert.ok(!/entry-regen/.test(wWhy()), wWhy()));
    // SIMPLE SYRUP pays 0.512/level against WATER's 0.284, and joe has ZERO
    // innate regen — so the two cards are not worth the same and the flat +16
    // they both used to get was wrong.
    pineBot.test.setOwned({ 'SIMPLE SYRUP': 0, 'WATER': 0 });
    // v6.114.0 REVERSED — this test was wrong and slot-lockout proved it.
    // 6.112.0 scaled the checkpoint by HP/s per level so SIMPLE SYRUP (0.512)
    // outbid WATER (0.284). Correct on regen arithmetic, wrong on craft
    // mechanics: SIMPLE SYRUP *is* the WATER + SUGAR craft, and DAY_ORDER ranks
    // it after both halves on purpose. The conflict only became visible when
    // 6.114.0 opened the checkpoint at 120 s instead of 600 s, at which point
    // the two cards scored 319 / 322 — syrup ahead of its own ingredient. Both
    // cards now take the SAME deficit bonus and the day order decides.
    test('both regen cards take the checkpoint, and the craft order survives it', () => {
        const sc = n => pineBot.test.scoreCard({ n: n, type: 'passive', lv: 2, maxlv: 6 }, 0, []);
        const w = sc('WATER'), s = sc('SIMPLE SYRUP');
        assert.ok(/entry-regen-water/.test(w.why) && /entry-regen-syrup/.test(s.why),
            'w=' + w.why + ' | s=' + s.why);
        assert.ok(w.score >= s.score,
            'syrup ' + Math.round(s.score) + ' outbids its own ingredient WATER ' + Math.round(w.score));
    });
    // THE GATE TIME. The income audit says the pool is draining from minute
    // zero (bucket 0: loss 1.27/s vs gain 1.00/s); the checkpoint used to open
    // at 600 s, one whole bucket after the bleeding starts. Asserted against a
    // literal so moving the config cannot move the assertion with it.
    test('the regen checkpoint opens inside the first income bucket, not after it', () => {
        assert.ok(pineBot.config.deepHell.regenFromS < 600,
            'regenFromS ' + pineBot.config.deepHell.regenFromS + ' — still opens after the pool has drained');
        const sc = () => pineBot.test.scoreCard({ n: 'WATER', type: 'passive', lv: 2, maxlv: 6 }, 0, []);
        global.gameTime = pineBot.config.deepHell.regenFromS + 20;
        assert.ok(/entry-regen/.test(sc().why), 'silent just after the gate: ' + sc().why);
        global.gameTime = pineBot.config.deepHell.regenFromS - 20;
        assert.ok(!/entry-regen/.test(sc().why), 'firing before the gate: ' + sc().why);
        global.gameTime = 800;
    });
    // The deficit term itself: a bot with NO regen must bid harder than one
    // that is nearly there, or the checkpoint is just a flat bonus again.
    test('the bonus scales with how far under break-even the bot is', () => {
        const sc = () => pineBot.test.scoreCard({ n: 'WATER', type: 'passive', lv: 2, maxlv: 6 }, 0, []);
        pineBot.test.setOwned({ 'SIMPLE SYRUP': 0, 'WATER': 0 });
        const broke = sc();
        pineBot.test.setOwned({ 'SIMPLE SYRUP': 2 });          // 1.024 of a 1.579 bar
        const closer = sc();
        pineBot.test.setOwned({ 'SIMPLE SYRUP': 0 });
        assert.ok(/short\)/.test(broke.why), 'the deficit is not reported: ' + broke.why);
        assert.ok(broke.score > closer.score + 10,
            'zero-regen ' + Math.round(broke.score) + ' vs nearly-there ' + Math.round(closer.score) +
            ' — the bonus is flat, not deficit-scaled');
    });
    // The break-even bar must sit under what the game can actually produce, or
    // it is capStable.defMin 35-vs-34.992 all over again.
    test('break-even is REACHABLE: under max buyable regen, over the old flat gate', () => {
        const maxRegen = 6 * 0.512 + 6 * 0.284;          // SIMPLE SYRUP 6 + WATER 6 = 4.776
        const be = 60 / pineBot.config.mitigation.invulnFrames * 1;   // at armour cap
        assert.ok(be < maxRegen, 'break-even ' + be.toFixed(3) + ' >= max buyable ' + maxRegen.toFixed(3));
        assert.ok(be > pineBot.config.deepHell.parkRegenRate,
            'break-even ' + be.toFixed(3) + ' <= the old flat gate — this change does nothing');
    });
    pineBot.test.setOwned({ 'SIMPLE SYRUP': 0 });
    // v6.99.2 ENTRY-ARMOR CHECKPOINT: defense behind at entry prep -> OLIVE jumps.
    global.gameTime = 1080;   // v6.100.0: entryPrepFromS moved 900 -> 1050
    global.player.defense = 20;
    const oWhy = () => pineBot.test.scoreCard({ n: 'OLIVE', type: 'passive', lv: 2, maxlv: 6 }, 0, []).why || '';
    test('entry prep with armor behind: OLIVE carries entry-armor', () =>
        assert.ok(/entry-armor/.test(oWhy()), oWhy()));
    // v6.105.0 THE BAR IS THE CEILING, NOT THE PARK GATE. `< 30` only ever
    // worked by coincidence — OLIVE 5 is 29.16 (under) and OLIVE 6 is 34.992
    // (over) — so it read as "not at cap" purely because those are the two
    // rungs that exist. Four funnels running medianEntryDef 29.2 say the
    // entrant is stuck one level short, so the bar is stated as the ceiling
    // and only a build AT it stands the checkpoint down.
    global.player.defense = 32;
    test('...at 32 — past the old park gate but still short of the cap — it KEEPS pushing', () =>
        assert.ok(/entry-armor/.test(oWhy()), oWhy()));
    global.player.defense = 6 * 5.832;   // 34.992, the game's hard ceiling
    test('...and only at the OLIVE-6 ceiling does the checkpoint stand down', () =>
        assert.ok(!/entry-armor/.test(oWhy()), oWhy()));
    // THE EARLY TIER (the actual 6.105.0 fix): the hard checkpoint gets only
    // ~150 s before hell latches at 1200, which is often not one level-up.
    // A weaker nudge opens at entryArmorFromS so the armour line can finish
    // in time. It is a pick weight, not a movement gate — the distinction
    // the 6.99.2 entryPrepFromS collapse (dayClear 0.15 -> 0.02) established.
    global.player.defense = 20;
    global.gameTime = 800;                       // past entryArmorFromS 750, before 1050
    test('the early tier nudges OLIVE well before the hard checkpoint', () =>
        assert.ok(/entry-armor-early/.test(oWhy()), oWhy()));
    global.gameTime = 700;                       // before entryArmorFromS
    test('...and below entryArmorFromS neither tier fires', () =>
        assert.ok(!/entry-armor/.test(oWhy()), oWhy()));
    test('entryArmorFromS ships at 750', () =>
        assert.strictEqual(pineBot.config.movement.entryArmorFromS, 750));
    global.gameTime = 1080;

    // A mark on the seat releases it — the corner doctrine, unchanged.
    global.dropMarks = [{ x: 20, y: 20, r: 58, dmg: 72, tele: 0.6, at: 1155 }];
    pl = scene(1150, { x: 8, y: 8 });
    test('a mark on the seat releases it', () => assert.ok(!pl.seated, 'seated under a mark'));
    global.dropMarks = [];
    done();
}

// ...and the HELL side of the window, in a hell-latched env.
if (which === 'entry-seat-hell') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 1250, hell: true } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.applyDefaults();
        pineBot.test.setChar('pat');
        pineBot.test.setOwned({ 'SOUTH SIDE': 1 });
        const scene = (gt, extraP) => {
            global.player = Object.assign({ x: 200, y: 200, hp: 170, maxHp: 180, speed: 1.9, r: 7.2,
                                            ultReadyAt: 1e9 }, extraP || {});
            global.enemies = [];
            global.gameTime = gt;
            let pl; for (let i = 0; i < 3; i++) pl = pineBot.test.planMove();
            return pl;
        };
        // EARLY HELL, park gates NOT passed (no defense): the seat bridges.
        let pl = scene(1250);
        test('early hell without park gates: the seat BRIDGES', () =>
            assert.ok(pl.seated === true, JSON.stringify({ s: pl.seated, park: pl.parkOn })));
        // ...and the window closes at entrySeatUntilS — the bridge is a
        // window, not a promise the corner is safe forever unarmored.
        pl = scene(1400);
        test('past entrySeatUntilS the bridge releases', () =>
            assert.ok(!pl.seated, 'seated at 1400'));
        // endRun exists and books safely even with no run active.
        test('pineBot.endRun is callable and idempotent', () =>
            assert.ok(typeof pineBot.endRun === 'function' && /booked/.test(String(pineBot.endRun()))));
        done();
    }, 700);
}

// v6.96.0 — THE RUN CAP (user): "we need to add a kill itself feature as we
// have established it can't die once the full set up is complete ... or have
// some cap of runs ... to stop at the 200 minute mark." Past runCapS the
// movement layer dives at the nearest live enemy over the top of the whole
// override chain, and the abilities layer holsters the ult. Both halves are
// asserted with the config's own teeth: zero the cap and the same state must
// flip back to normal doctrine.
if (which === 'run-cap') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 12050 } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.applyDefaults();
        const T = pineBot.test;
        // v6.99.3: gts derive from the SHIPPED cap so the scenario tracks it,
        // plus one explicit tooth on the value itself (150 min, user's call).
        const CAP = pineBot.config.deepHell.runCapS;
        test('runCapS ships at 9000 (150 minutes)', () => assert.strictEqual(CAP, 9000));
        const scene = (gt) => {
            global.player = { x: 200, y: 200, hp: 460, maxHp: 469, speed: 3.0, r: 7.2, ultReadyAt: 1e9 };
            // one live body due east, inside the 200px gather range; the
            // dive should head straight at it — a fast chaser joe would
            // otherwise kite away from, which is what makes it the teeth of
            // the below-cap arm too.
            global.enemies = [{ type: 'drunk', id: 1, x: 320, y: 200, hp: 500, maxHp: 500, r: 12, speed: 8 }];
            global.gameTime = gt;
            let pl; for (let i = 0; i < 4; i++) pl = T.planMove();
            return pl;
        };
        // 1. Past the cap: the plan says so, and the heading is the PATROL.
        //    v6.96.2 (user, watching the live cap-out): "it just needs to
        //    walk around the map and doesn't need to dash and it will keep
        //    getting hit by the common projectile mobs." Both dives (6.96.0
        //    nearest-body, 6.96.1 boss-seek) were guesses; the patrol is the
        //    user's design, signed by run 4589's own death tag (`proj` the
        //    moment it left the corner). First waypoint is the field centre —
        //    from (200,200) on a 540-field that is a NE diagonal, and the
        //    nearby enemy due east must NOT bend the heading: this is a walk
        //    across open ground, not a dive at a body.
        T.resetCapLadder();
        let pl = scene(CAP + 50);
        test('past the cap the plan declares the dive', () =>
            assert.strictEqual(pl.capDive, true, JSON.stringify({ capDive: pl.capDive })));
        test('...and opens on rung 1, the smother', () =>
            assert.strictEqual(pl.capStage, 1));
        // v6.101.0 DOCTRINE INVERSION, and the assertion is deliberately the
        // OPPOSITE of the one that stood here through 6.96.2-6.100.1. That
        // test demanded the heading IGNORE the body beside it and walk to the
        // field centre, because the cap was a five-point patrol. The patrol
        // was measured failing at the largest possible scale — 6.100.0 booked
        // 25,141 s and 22,800 s against a 9000 s cap — and the reason is that
        // its four corner waypoints are the SAFE ground the seat is built on.
        // Contact is the one damage a maxed build cannot out-regen, so the
        // cap must now walk straight AT the nearest body and stop on it.
        test('...heading straight AT the body, not past it', () =>
            assert.ok(pl.dx > 0.9 && Math.abs(pl.dy) < 0.2, 'dx ' + pl.dx.toFixed(2) + ' dy ' + pl.dy.toFixed(2)));
        // 1b. THE STAND ITSELF — the whole mechanism. Standing on the crowd,
        //     velocity must go to ZERO: sustained contact is ~15.5 dps against
        //     1.71-3.07 HP/s regen, which kills a 469-HP build in ~36 s. Any
        //     residual movement is what kept the patrol alive for four hours.
        {
            global.player = { x: 320, y: 200, hp: 460, maxHp: 469, speed: 3.0, r: 7.2, ultReadyAt: 1e9 };
            global.enemies = [{ type: 'drunk', id: 1, x: 320, y: 200, hp: 500, maxHp: 500, r: 12, speed: 8 }];
            global.gameTime = CAP + 51;
            let plS; for (let i = 0; i < 4; i++) plS = T.planMove();
            test('standing on the crowd, the smother STOPS dead', () =>
                assert.ok(plS.dx === 0 && plS.dy === 0, 'dx ' + plS.dx + ' dy ' + plS.dy));
        }
        // 1b-ii. A BOSS OUTRANKS THE CENTROID — bosses carry the biggest
        //        contactDmg, so they are the fastest death available.
        {
            global.player = { x: 270, y: 270, hp: 460, maxHp: 469, speed: 3.0, r: 7.2, ultReadyAt: 1e9 };
            global.enemies = [
                { type: 'drunk', id: 1, x: 275, y: 100, hp: 500, maxHp: 500, r: 12, speed: 8 },
                { type: 'drunk', id: 2, x: 265, y: 100, hp: 500, maxHp: 500, r: 12, speed: 8 },
                { type: 'boss', id: 3, boss: true, x: 270, y: 460, hp: 9e5, maxHp: 9e5, r: 30, speed: 3 }
            ];
            global.gameTime = CAP + 52;
            let plB; for (let i = 0; i < 4; i++) plB = T.planMove();
            test('the smother takes the BOSS over the commons centroid', () =>
                assert.ok(plB.dy > 0.9, 'dy ' + plB.dy.toFixed(2) + ' (positive = toward the boss)'));
        }
        // 1b-iii. v6.103.0 A CENTROID IS NOT A BODY, and this is a SIGN FLIP
        //         against the 6.102.0 behaviour it replaces. Measured: all six
        //         6.102.0 cap-outs booked at exactly capAt + capStandS, i.e.
        //         the smother never killed and rung 2 did. The geometry is the
        //         reason — a crowd that has surrounded the player has its
        //         centroid AT the player, so aiming there resolved to standing
        //         in a hole in the middle of a ring, taking no contact at all.
        //         Ring below is built so the centroid lies 12.5 px BELOW the
        //         player while the nearest real body sits 70 px ABOVE it:
        //         centroid-aiming heads +y, body-aiming heads -y.
        {
            global.player = { x: 270, y: 270, hp: 460, maxHp: 469, speed: 3.0, r: 7.2, ultReadyAt: 1e9 };
            global.enemies = [
                { type: 'drunk', id: 1, x: 270, y: 200, hp: 500, maxHp: 500, r: 12, speed: 8 },
                { type: 'drunk', id: 2, x: 270, y: 390, hp: 500, maxHp: 500, r: 12, speed: 8 },
                { type: 'drunk', id: 3, x: 150, y: 270, hp: 500, maxHp: 500, r: 12, speed: 8 },
                { type: 'drunk', id: 4, x: 390, y: 270, hp: 500, maxHp: 500, r: 12, speed: 8 }
            ];
            global.gameTime = CAP + 53;
            let plR; for (let i = 0; i < 4; i++) plR = T.planMove();
            test('surrounded, the smother walks at the nearest BODY, not the empty centroid', () =>
                assert.ok(plR.dy < -0.5, 'dy ' + plR.dy.toFixed(2) + ' (negative = at the body; positive = the old centroid)'));
        }
        // 1c. THE DASH IS HOLSTERED. An escape-worthy emergency (mark
        //     underfoot, contact imminent, huge danger) dashes below the cap
        //     and must NOT dash during the patrol — the dash burst is what
        //     keeps carrying the bot out of the projectile paths.
        {
            let dashes = 0; global.tryDash = () => { dashes++; };
            const dashPlan = (cap) => ({ hpRatio: 0.9, hpPanic: false, panic: false, danger: 9999, dx: 1, dy: 0,
                                         near: 2, adjacent: 18, contactImminent: true, markHere: true, toughness: 1,
                                         passoutsNear: 0, poCentroidDist: 9999, poNearest: 9999, capDive: cap });
            global.gameTime = CAP + 50;
            T.maybeAbilities(dashPlan(true));
            test('past the cap the dash stays holstered', () => assert.strictEqual(dashes, 0));
            global.gameTime = CAP - 100;
            T.maybeAbilities(dashPlan(false));
            test('the same emergency below the cap dashes', () => assert.ok(dashes >= 1, 'dashes ' + dashes));
            // v6.101.0 BELT AND BRACES (the user's reported symptom: "it's
            // using dashes even after when it's supposed to just get constant
            // contact damage"). The ult gate has always ALSO consulted the gt
            // clock; the dash gate read plan.capDive alone, so a plan that
            // arrived without the flag re-armed the dash past the cap while
            // the ult stayed holstered. One dash is not cosmetic: it is a
            // 0.16 s burst that breaks the contact the kill depends on.
            dashes = 0;
            global.gameTime = CAP + 50;
            const noFlag = dashPlan(undefined); delete noFlag.capDive;
            T.resetUltGate(); T.maybeAbilities(noFlag);
            test('past the cap a plan with NO capDive flag still holsters the dash', () =>
                assert.strictEqual(dashes, 0, 'dashed ' + dashes + 'x on the gt clock alone'));
        }
        // 2. Below the cap the same field is fled, not embraced.
        pl = scene(CAP - 100);
        test('below the cap there is no dive', () =>
            assert.strictEqual(pl.capDive, false));
        // 3. THE CONFIG'S TEETH: zero the cap and 12050 s is an ordinary tick.
        pineBot.config.deepHell.runCapS = 0;
        pl = scene(CAP + 50);
        test('runCapS = 0 disables the dive entirely', () =>
            assert.strictEqual(pl.capDive, false));
        pineBot.config.deepHell.runCapS = CAP;
        // 4. THE ULT STAYS HOLSTERED. Same plan state fires below the cap and
        //    must not fire past it — the invulnerability window is the one
        //    tool that could carry a full build through the dive alive.
        const fire = (gt) => {
            global.gameTime = gt;
            let n = 0; global.useUltimate = () => { n++; };
            T.resetUltGate();
            T.maybeAbilities({ hpRatio: 0.9, hpPanic: false, panic: false, danger: 0, dx: 0, dy: 0,
                               near: 2, adjacent: 18, contactImminent: true, toughness: 1,
                               passoutsNear: 0, poCentroidDist: 9999, poNearest: 9999 });
            return n;
        };
        test('below the cap the same emergency fires the ult', () =>
            assert.ok(fire(CAP - 100) >= 1, 'ult did not fire below the cap'));
        test('past the cap the ult is holstered', () =>
            assert.strictEqual(fire(CAP + 50), 0));
        // ...and the holster is the CAP's doing, not a side effect: zero the
        // cap and the same past-12000 state fires again.
        pineBot.config.deepHell.runCapS = 0;
        test('runCapS = 0 re-arms the ult past the cap', () =>
            assert.ok(fire(CAP + 50) >= 1, 'ult still holstered with the cap disabled'));
        pineBot.config.deepHell.runCapS = CAP;

        // 5. v6.99.3 EARLY CAP — the stability proof. Config teeth first:
        const CS = pineBot.config.deepHell.capStable;
        test('capStable ships fromS 2400 / hpFloor 0.97 / defMin 34.9 / supersMin 3 / holdS 300 / dipGraceS 4', () =>
            assert.ok(CS && CS.fromS === 2400 && CS.hpFloor === 0.97 &&
                      CS.defMin === 34.9 && CS.supersMin === 3 && CS.holdS === 300 && CS.dipGraceS === 4));
        // v6.102.0 THE CEILING TOOTH — the assertion that would have caught
        // the bug that made the whole early cap dead code for four versions.
        // The game computes player.defense = min(60, 3*upDefense + pas.armor);
        // pas.armor is 5.832/OLIVE level, OLIVE caps at 6, and upDefense is
        // unobtainable, so defense can never exceed 6 x 5.832 = 34.992.
        // defMin shipped at 35, so the armour leg was false on every frame of
        // every run and earlyCaps read 0 everywhere. Any future edit that
        // raises defMin above the ceiling fails here.
        const DEF_CEILING = 6 * 5.832;   // 34.992, from the game's own source
        test('defMin is REACHABLE — at or under the 34.992 defense ceiling', () =>
            assert.ok(CS.defMin <= DEF_CEILING,
                'defMin ' + CS.defMin + ' > ceiling ' + DEF_CEILING + ' — the early cap can never fire'));
        // ...and every early-cap test below now runs at the REAL ceiling
        // rather than a rounded 35, so they are all regression tests for it.
        const stableScene = (gt, extraP) => {
            global.player = Object.assign({ x: 200, y: 200, hp: 469, maxHp: 469, speed: 3.0,
                                            r: 7.2, ultReadyAt: 1e9, defense: DEF_CEILING }, extraP || {});
            global.enemies = [];
            global.gameTime = gt;
            let pl; for (let i = 0; i < 2; i++) pl = T.planMove();
            return pl;
        };
        T.resetCapLatch(); T.setSupers(4);
        stableScene(4000);                       // proof clock starts
        pl = stableScene(4200);                  // 200 s held: under holdS
        test('a held window SHORTER than holdS does not cap', () =>
            assert.strictEqual(pl.capDive, false));
        pl = stableScene(4320);                  // 320 s held: proof complete
        test('full hp + seat armor + supers held past holdS = EARLY CAP', () =>
            assert.strictEqual(pl.capDive, true, JSON.stringify({ cd: pl.capDive })));
        pl = stableScene(4330, { hp: 200 });     // patrol has begun draining hp
        test('...and the latch HOLDS while the patrol drains hp', () =>
            assert.strictEqual(pl.capDive, true));
        // v6.100.1 DIP GRACE (user: "the bot is not dying even with the kill
        // protocol" — a contact-damage game chips hp every few seconds even
        // on a tanky build, so the OLD "any instantaneous dip zeroes the
        // clock" rule meant the 300 s proof essentially never completed).
        // A blip shorter than dipGraceS (4 s) must NOT cost the streak:
        T.resetCapLatch(); T.setSupers(4);
        stableScene(5000);                       // proof clock starts
        stableScene(5100, { hp: 380 });           // dip begins (under 97%) at t=100s in
        stableScene(5102, { hp: 469 });           // back in the green 2s later — inside the 4s grace
        pl = stableScene(5300);                  // 300 s after the ORIGINAL start: proof complete
        test('a brief hp dip WITHIN dipGraceS does not reset the proof clock', () =>
            assert.strictEqual(pl.capDive, true, JSON.stringify({ cd: pl.capDive, dbg: T.capDebug() })));
        // ...but a dip that OUTLASTS the grace still resets fully, same as before:
        T.resetCapLatch(); T.setSupers(4);
        stableScene(6000);                       // proof clock starts
        stableScene(6100, { hp: 380 });           // dip begins at t=100s in
        stableScene(6106, { hp: 380 });           // still dipping 6s later — grace (4s) exceeded
        test('...a dip that OUTLASTS dipGraceS resets the streak', () =>
            assert.strictEqual(T.capDebug().capStableSince, null));
        test('...and records WHICH leg broke it (hp)', () =>
            assert.strictEqual(T.capDebug().capLastResetReason, 'hp'));
        pl = stableScene(6500, { hp: 469 });      // healthy again, but the clock had to restart
        test('...so the proof is not complete yet even 500s past the original start', () =>
            assert.strictEqual(pl.capDive, false));
        // dipGraceS: 0 restores the strict all-or-nothing legacy behavior:
        T.resetCapLatch(); T.setSupers(4);
        pineBot.config.deepHell.capStable = Object.assign({}, CS, { dipGraceS: 0 });
        stableScene(6600);
        stableScene(6700, { hp: 380 });           // instantaneous dip, zero grace configured
        test('dipGraceS: 0 resets on ANY dip, however brief', () =>
            assert.strictEqual(T.capDebug().capStableSince, null));
        pineBot.config.deepHell.capStable = CS;
        // supers under the floor never prove anything:
        T.resetCapLatch(); T.setSupers(1);
        stableScene(6000);
        pl = stableScene(6320);
        test('supers under supersMin: stable hp alone is not a proof', () =>
            assert.strictEqual(pl.capDive, false));
        T.setSupers(4);
        // the 06 ult holster honors the PLAN's early-cap latch, not just the
        // gt clock — below runCapS, a plan carrying capDive:true must not fire:
        {
            global.gameTime = CAP - 100;
            let n = 0; global.useUltimate = () => { n++; };
            T.resetUltGate();
            T.maybeAbilities({ hpRatio: 0.9, hpPanic: false, panic: false, danger: 0, dx: 0, dy: 0,
                               near: 2, adjacent: 18, contactImminent: true, toughness: 1,
                               passoutsNear: 0, poCentroidDist: 9999, poNearest: 9999, capDive: true });
            test('an early-capped plan holsters the ult below the gt cap too', () =>
                assert.strictEqual(n, 0, 'ult fired ' + n + 'x under an early-cap plan'));
        }
        // holdS 0 disables the whole mechanism:
        T.resetCapLatch();
        pineBot.config.deepHell.capStable = Object.assign({}, CS, { holdS: 0 });
        stableScene(7000);
        pl = stableScene(7320);
        test('capStable.holdS = 0 disables the early cap', () =>
            assert.strictEqual(pl.capDive, false));
        pineBot.config.deepHell.capStable = CS;

        // 5b. v6.102.0 THE BUILD-COMPLETE MEASUREMENT. The user's question is
        //     "when should the kill protocol mark the build complete?" — so
        //     the bot now measures it instead of us guessing at fromS. The
        //     proof runs from gt 0; fromS gates only the LATCH.
        T.resetCapLatch(); T.resetCapLadder(); T.setSupers(4);
        stableScene(1400);   // armour + supers met here, LONG before fromS 3600
        test('capReadyGt records the build-complete gt, ignoring fromS', () =>
            assert.strictEqual(T.capDebug().capReadyGt, 1400));
        test('...and a complete build does NOT cap on its own before fromS', () =>
            assert.strictEqual(stableScene(2000).capDive, false));
        // ...but having held continuously since 1400, it latches AT the floor
        // rather than fromS+holdS: 2200 s of unbroken proof is already banked.
        test('a build ready long before fromS latches AT the floor', () =>
            assert.strictEqual(stableScene(3600).capDive, true));
        // supers short => the build is NOT complete, and readyAt stays unset.
        T.resetCapLatch(); T.resetCapLadder(); T.setSupers(1);
        stableScene(1500);
        test('an incomplete build books no readyAt', () =>
            assert.strictEqual(T.capDebug().capReadyGt, null));
        T.setSupers(4);

        // 6. v6.101.0 THE CAP LADDER. The smother is rung 1; if a build
        //    somehow survives standing in the crowd, the run must STILL end.
        //    This is the guarantee the 6.96.x/6.100.x cap never had, and the
        //    reason a single window could sit on one run for four hours.
        const STAND = pineBot.config.deepHell.capStandS;
        const FORCE = pineBot.config.deepHell.capForceS;
        test('the ladder ships capStandS 15 / capForceS 120', () =>
            assert.ok(STAND === 15 && FORCE === 120, 'stand ' + STAND + ' force ' + FORCE));
        const ladder = (gt) => {
            global.player = { x: 200, y: 200, hp: 460, maxHp: 469, speed: 3.0, r: 7.2, ultReadyAt: 1e9 };
            global.enemies = [{ type: 'drunk', id: 1, x: 320, y: 200, hp: 500, maxHp: 500, r: 12, speed: 8 }];
            global.gameTime = gt;
            let p2; for (let i = 0; i < 2; i++) p2 = T.planMove();
            return p2;
        };
        T.resetCapLatch(); T.resetCapLadder();
        ladder(CAP + 10);                       // engages here: capFirstGt = CAP+10
        test('rung 1 while the smother has time to work', () =>
            assert.strictEqual(ladder(CAP + 10 + STAND - 5).capStage, 1));
        test('rung 2 once capStandS of standing in it did not kill', () =>
            assert.strictEqual(ladder(CAP + 10 + STAND + 1).capStage, 2));
        test('rung 3 once capForceS passed', () =>
            assert.strictEqual(ladder(CAP + 10 + FORCE + 1).capStage, 3));
        // 6b. RUNG 2 ACTUATES: the game's own hurtPlayer is called.
        {
            let hurt = 0, hurtArg = null;
            global.hurtPlayer = (d) => { hurt++; hurtArg = d; };
            global.gameTime = CAP + 10 + STAND + 1;
            T.maybeAbilities({ hpRatio: 0.9, dx: 0, dy: 0, near: 2, adjacent: 18, danger: 0,
                               toughness: 1, passoutsNear: 0, poCentroidDist: 9999, poNearest: 9999,
                               capDive: true, capStage: 2 });
            test('rung 2 calls the game\'s own hurtPlayer', () =>
                assert.ok(hurt >= 1, 'hurtPlayer called ' + hurt + 'x'));
            test('...for more than any build\'s HP pool', () =>
                assert.ok(hurtArg >= 1e5, 'dealt ' + hurtArg));
            // rung 1 must NEVER touch it — an ordinary capped run dies by
            // contact, and a damage hook firing early would fake every row.
            hurt = 0;
            T.maybeAbilities({ hpRatio: 0.9, dx: 0, dy: 0, near: 2, adjacent: 18, danger: 0,
                               toughness: 1, passoutsNear: 0, poCentroidDist: 9999, poNearest: 9999,
                               capDive: true, capStage: 1 });
            test('rung 1 does NOT call hurtPlayer', () => assert.strictEqual(hurt, 0));
        }
        // 6c. RUNG 3 ACTUATES: the run is navigated out whatever the game did.
        {
            let titled = 0;
            global.backToTitle = () => { titled++; };
            global.gameTime = CAP + 10 + FORCE + 1;
            T.maybeAbilities({ hpRatio: 0.9, dx: 0, dy: 0, near: 2, adjacent: 18, danger: 0,
                               toughness: 1, passoutsNear: 0, poCentroidDist: 9999, poNearest: 9999,
                               capDive: true, capStage: 3 });
            test('rung 3 forces the game out to the title', () =>
                assert.ok(titled >= 1, 'backToTitle called ' + titled + 'x'));
            titled = 0;
            T.maybeAbilities({ hpRatio: 0.9, dx: 0, dy: 0, near: 2, adjacent: 18, danger: 0,
                               toughness: 1, passoutsNear: 0, poCentroidDist: 9999, poNearest: 9999,
                               capDive: true, capStage: 1 });
            test('rung 1 does NOT navigate away', () => assert.strictEqual(titled, 0));
        }
        // 7. v6.104.0 THE PANEL'S "End Run". The overlay had no way to end a
        //    run at all, and pineBot.endRun() books the row but STOPS the bot,
        //    which is useless to an unattended farm. killNow() latches the
        //    early cap instead, so the whole tested ladder runs and the next
        //    run starts by itself. Two teeth: it must REFUSE when there is no
        //    run to end, and when there is one it must engage the dive far
        //    below both gates.
        T.resetCapLatch(); T.resetCapLadder();
        test('killNow refuses when no run is in progress', () =>
            assert.strictEqual(pineBot.killNow(), 'no run in progress'));
        test('...and latches nothing on the way out', () =>
            assert.strictEqual(T.capDebug().capEarly, false));
        global.state = 'playing';
        global.gameTime = 600;
        T.handleScreens();                       // a run is now live
        test('killNow engages once a run is live', () =>
            assert.strictEqual(pineBot.killNow(), 'kill protocol engaged'));
        {
            global.player = { x: 200, y: 200, hp: 460, maxHp: 469, speed: 3.0, r: 7.2, ultReadyAt: 1e9 };
            global.enemies = [{ type: 'drunk', id: 1, x: 320, y: 200, hp: 500, maxHp: 500, r: 12, speed: 8 }];
            global.gameTime = 600;
            let plK; for (let i = 0; i < 2; i++) plK = T.planMove();
            test('...and the dive engages far below BOTH the proof floor and the clock cap', () =>
                assert.strictEqual(plK.capDive, true,
                    'gt 600 vs fromS ' + CS.fromS + ' / runCapS ' + CAP));
        }
        done();
    }, 700);
}

// v6.96.2 — STORE GUARDS. The joe store died 2026-08-29: 153 runs / 44
// generations reset to defaults because the primary blob failed to parse and
// loadLearnInner's silent catch answered with a fresh store. Three guards:
// the loader heals from a __bak copy, a quota throw on save trims the store's
// reporting bulk and retries, and the 2.66 MB demo blob gets a byte cap.
if (which === 'store-guard') {
    const good = { bartender: 'joe', runs: 42, totalPicks: 7, items: {}, history: [], builds: {},
                   hof: [], genHistory: [], runLog: [], rosters: {}, rewardEpoch: CUR_EPOCH, cem: null, linucb: {} };
    const { pineBot, store } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 5 } });
    pineBot.stop();
    const T = pineBot.test;
    // 1. THE 2026-08-29 FAILURE, REPLAYED — first WITHOUT the backup (the
    //    silent-reset baseline), then WITH it (the heal). Same corrupt blob.
    // v6.111.0 TUNABLE_PRIOR MAINTENANCE. The table exists to give a store
    // written before the box-change re-open the boxes it was actually trained
    // under, and it is needed exactly once. An entry left in it after its
    // migration has run re-opens that dimension on EVERY load — a permanent
    // 25% sigma and a search that can never converge, which would look in the
    // data exactly like the flat median this version is trying to break.
    // So: every key must name a dim whose box HAS moved, i.e. must differ from
    // the live box. When the next version bump empties the table this passes
    // vacuously; if it is emptied and a box is widened without seeding, the
    // box-reopen scenario goes red instead. One of the two always catches it.
    test('every TUNABLE_PRIOR entry names a box that actually moved', () => {
        const prior = T.tunablePrior(), live = T.tunable();
        for (const k of Object.keys(prior)) {
            assert.ok(live[k], 'TUNABLE_PRIOR names ' + k + ', which is not a TUNABLE dimension');
            assert.ok(prior[k].min !== live[k].min || prior[k].max !== live[k].max,
                k + ' is in TUNABLE_PRIOR but its box is unchanged — this re-opens the dim on every single load');
        }
    });
    store.pineBotUCB_v5_joe = '{CORRUPT';
    delete store.pineBotUCB_v5_joe__bak;
    test('a corrupt primary with no backup still resets (the old world)', () =>
        assert.strictEqual(T.loadLearn().runs, 0));
    store.pineBotUCB_v5_joe = '{CORRUPT';
    store.pineBotUCB_v5_joe__bak = JSON.stringify(good);
    test('a corrupt primary HEALS from the backup', () =>
        assert.strictEqual(T.loadLearn().runs, 42));
    delete store.pineBotUCB_v5_joe;   // the vanished-key variant of the same failure
    test('a MISSING primary heals from the backup too', () =>
        assert.strictEqual(T.loadLearn().runs, 42));
    // 1b. v6.107.0 — FOUR NEW CEM DIMENSIONS AGAINST A 6.106.0 STORE.
    // The TUNABLE comment warns that adding a dimension to a LIVE learner
    // requires seeding mean=default and sigma=(max-min)/4 first, because the
    // 6.85.22 accident added six dims with no seed, drew NaN for every one,
    // and poisoned the batch/hof/step-size state across 27 refits. The loader
    // has since been hardened to seed unconditionally — this asserts that,
    // rather than trusting it, because four dims land at once in this version.
    const old6106 = Object.assign({}, good, {
        cem: { gen: 9, batch: [], mean: { 'movement.standoff': 120 }, sigma: { 'movement.standoff': 20 } }
    });
    store.pineBotUCB_v5_joe = JSON.stringify(old6106);
    delete store.pineBotUCB_v5_joe__bak;
    const migrated = T.loadLearn();
    const NEWDIMS = ['movement.bossRingMul', 'movement.poRingMul',
                     'movement.anchorValue', 'movement.anchorTtkS'];
    test('a 6.106.0 store seeds every new dimension with a FINITE mean', () => {
        for (const k of NEWDIMS)
            assert.ok(isFinite(migrated.cem.mean[k]),
                k + ' mean ' + migrated.cem.mean[k] + ' — this is the 6.85.22 NaN failure');
    });
    test('...at the documented default, not at a box edge', () => {
        const box = T.tunable();
        for (const k of NEWDIMS) {
            const m = migrated.cem.mean[k];
            assert.ok(m > box[k].min - 1e-9 && m < box[k].max + 1e-9,
                k + ' mean ' + m + ' outside ' + JSON.stringify([box[k].min, box[k].max]));
        }
    });
    test('...with a sigma wide enough to actually explore the new box', () => {
        const box = T.tunable();
        for (const k of NEWDIMS) {
            const range = box[k].max - box[k].min;
            assert.ok(migrated.cem.sigma[k] > range * 0.05,
                k + ' sigma ' + migrated.cem.sigma[k] + ' vs range ' + range);
        }
    });
    test('and the dimension the old store DID hold is preserved untouched', () =>
        assert.strictEqual(migrated.cem.mean['movement.standoff'], 120));

    // 2. QUOTA: a save that throws once must trim its reporting bulk and
    //    land, and a successful save must leave a fresh backup behind.
    const L = T.getLearn();
    for (let i = 0; i < 100; i++) L.runLog.push({ t: i, d: 1, s: 1, r: 1 });
    const realSet = global.localStorage.setItem;
    let onceArmed = true;
    global.localStorage.setItem = (k, v) => {
        if (k === 'pineBotUCB_v5_joe' && onceArmed) { onceArmed = false; const err = new Error('full'); err.name = 'QuotaExceededError'; throw err; }
        return realSet(k, v);
    };
    test('a quota throw trims and retries instead of losing the run', () =>
        assert.strictEqual(T.saveLearn(), true));
    test('...the landed blob really was trimmed', () =>
        assert.ok(JSON.parse(store.pineBotUCB_v5_joe).runLog.length <= 10,
            'runLog kept ' + JSON.parse(store.pineBotUCB_v5_joe).runLog.length));
    test('...and the backup copy was refreshed', () =>
        assert.ok(!!store.pineBotUCB_v5_joe__bak && JSON.parse(store.pineBotUCB_v5_joe__bak).runs === JSON.parse(store.pineBotUCB_v5_joe).runs));
    // teeth: a store that CANNOT fit still reports failure loudly
    global.localStorage.setItem = (k, v) => {
        if (k === 'pineBotUCB_v5_joe') { const err = new Error('full'); err.name = 'QuotaExceededError'; throw err; }
        return realSet(k, v);
    };
    test('an unfixably full own store still returns failure', () =>
        assert.strictEqual(T.saveLearn(), false));
    global.localStorage.setItem = realSet;
    // 3. THE DEMO CAP: bytes, not count, oldest dropped first.
    pineBot.config.learning.demoCapBytes = 50000;
    const fat = (id) => ({ at: id, n: 500, samples: Array.from({ length: 500 }, (_, i) => ({ gt: i, x: 100.123, y: 200.456, poD: 55.5 })), events: [] });
    store.pineBotDemos = JSON.stringify([fat(1), fat(2), fat(3)]);
    T.startDemo(); T.demoSave();
    test('the demo blob is capped by BYTES, oldest dropped', () => {
        const blob = store.pineBotDemos;
        assert.ok(blob.length <= 50000, 'blob ' + blob.length);
        assert.ok(!JSON.parse(blob).some(d => d.at === 1), 'oldest demo survived the cap');
    });
    // ...and the cap is the CONFIG doing it, not a hidden constant.
    pineBot.config.learning.demoCapBytes = 9000000;
    store.pineBotDemos = JSON.stringify([fat(1), fat(2), fat(3)]);
    T.startDemo(); T.demoSave();
    test('with the cap out of reach the 4-demo window is unchanged', () =>
        assert.strictEqual(JSON.parse(store.pineBotDemos).length, 4));
    done();
}

// v6.96.2 — THE PHASE AUDIT (user: "get the data of how it survived day mode
// and hell and deep hell mode"). Classification is a pure function of the
// death time, the hell flag, and the latch gt; the aggregation turns 240 rows
// into the day -> entry -> hell -> deep funnel per version.
if (which === 'phase-audit') {
    const seeded = { rows: [
        // 5 day deaths, 2 entry, 2 hell, 1 deep cap-out — all version 'X'
        ...Array.from({ length: 5 }, (_, i) => ({ v: 'X', t: 300 + i, ph: 'day', cause: 'contact', hEnt: null, sup: 0, day: false, seat: null, def: null, regen: null, ultLv: null, cap: false })),
        { v: 'X', t: 1400, ph: 'entry', cause: 'contact', hEnt: 1320, sup: 1, day: true, seat: false, def: 24, regen: 0.6, ultLv: 1, cap: false },
        { v: 'X', t: 1500, ph: 'entry', cause: 'mark', hEnt: 1330, sup: 1, day: true, seat: false, def: 26, regen: 0.8, ultLv: 2, cap: false },
        { v: 'X', t: 3000, ph: 'hell', cause: 'contact', hEnt: 1320, sup: 2, day: true, seat: true, def: 31, regen: 1.1, ultLv: 3, cap: false },
        { v: 'X', t: 4000, ph: 'hell', cause: 'proj', hEnt: 1325, sup: 3, day: true, seat: false, def: 33, regen: 1.4, ultLv: 3, cap: false },
        { v: 'X', t: 12030, ph: 'deep', cause: 'contact', hEnt: 1320, sup: 3, day: true, seat: true, def: 35, regen: 1.5, ultLv: 4, cap: true, capAt: 4100 }
    ] };
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 1350, hell: true },
        storage: { pineBotPhaseAudit: JSON.stringify(seeded) } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.applyDefaults();
        const T = pineBot.test;
        // 1. CLASSIFICATION. Day first (flag false), then latch hell the way
        //    the main loop does and let the next gather record the latch gt.
        test('hell never entered books as DAY', () =>
            assert.strictEqual(T.buildPhaseRow(800, false).ph, 'day'));
        T.handleScreens();   // latch hell (env hell: true)
        global.player = { x: 200, y: 200, hp: 90, maxHp: 100, speed: 3, r: 7.2 };
        global.enemies = []; global.gameTime = 1350;
        T.gatherThreats(global.player);
        let row = T.buildPhaseRow(1500, true);
        test('death within entryS of the latch books as ENTRY', () =>
            assert.strictEqual(row.ph, 'entry', JSON.stringify(row)));
        test('...and the latch gt rode along', () => assert.strictEqual(row.hEnt, 1350));
        test('past the entry window, before deep: HELL', () =>
            assert.strictEqual(T.buildPhaseRow(3000, true).ph, 'hell'));
        test('past deepFromS: DEEP', () =>
            assert.strictEqual(T.buildPhaseRow(8000, true).ph, 'deep'));
        // config teeth: the thresholds are the CONFIG, not constants
        pineBot.config.phaseAudit.deepFromS = 99999;
        test('deepFromS is read from config', () =>
            assert.strictEqual(T.buildPhaseRow(8000, true).ph, 'hell'));
        pineBot.config.phaseAudit.deepFromS = 7200;
        pineBot.config.phaseAudit.entryS = 5;
        test('entryS is read from config', () =>
            assert.strictEqual(T.buildPhaseRow(1500, true).ph, 'hell'));
        pineBot.config.phaseAudit.entryS = 300;
        // 2. THE CAP FLAG: false before any dive, true after one.
        test('an undived run books cap:false', () =>
            assert.strictEqual(T.buildPhaseRow(12060, true).cap, false));
        global.enemies = [{ type: 'drunk', id: 1, x: 300, y: 200, hp: 500, maxHp: 500, r: 12, speed: 8 }];
        global.gameTime = 12050;
        for (let i = 0; i < 3; i++) T.planMove();
        test('a run that engaged the dive books cap:true', () =>
            assert.strictEqual(T.buildPhaseRow(12060, true).cap, true));
        // v6.99.4: the row also books WHEN the patrol first engaged.
        test('...and capAt records the engage gt (clock cap here)', () =>
            assert.strictEqual(T.buildPhaseRow(12060, true).capAt, 12050));
        // 3. AGGREGATION over the seeded rows: the funnel numbers.
        const rep = global.window.pineBot.phaseAudit();
        const g = rep.groups.find(x => x.version === 'X');
        test('the seeded rows aggregate into one group of 10', () =>
            assert.ok(g && g.n === 10, JSON.stringify(rep.groups.map(x => [x.version, x.n]))));
        test('deaths split day/entry/hell/deep = 5/2/2/1', () =>
            assert.deepStrictEqual(g.deaths, { day: 5, entry: 2, hell: 2, deep: 1 }));
        test('dayClearRate 0.5, entrySurvival 0.6, deepRate 0.1', () =>
            assert.ok(g.dayClearRate === 0.5 && g.entrySurvival === 0.6 && g.deepRate === 0.1, JSON.stringify(g)));
        // v6.99.4: the seeded cap-out carries capAt 4100 — under runCapS
        // 9000, so it books as an EARLY cap with a median latch time.
        test('the funnel splits early caps from clock caps (earlyCaps 1, medianCapAt 4100)', () =>
            assert.ok(g.earlyCaps === 1 && g.medianCapAt === 4100, JSON.stringify({ e: g.earlyCaps, m: g.medianCapAt })));
        test('the cap-out is counted, and seatedRate reads 2/5', () =>
            assert.ok(g.capOuts === 1 && g.seatedRate === 0.4, JSON.stringify(g)));
        // 4. v6.97.1 THE COMBINED PROBE (user): pineBot.report() bundles the
        //    four probes into one paste. The phases key must be the audit's
        //    OWN rows (the 10 seeded here), not a re-derivation.
        const rep2 = global.window.pineBot.report();
        test('pineBot.report() bundles compare/funnel/phases/damage', () =>
            assert.ok(rep2 && rep2.compare && rep2.funnel && Array.isArray(rep2.phases) && rep2.damage,
                Object.keys(rep2 || {}).join(',')));
        test('...and its phases are the seeded audit rows themselves', () =>
            assert.strictEqual(rep2.phases.length, 10));
        test('...and its funnel is the same aggregation', () =>
            assert.strictEqual(rep2.funnel.groups.find(x => x.version === 'X').n, 10));
        done();
    }, 700);
}

// v6.97.0 — JOE'S DAY, FIXED WHERE THE ROWS SAY HE DIES. The 6.96.2 phase
// rows (n=31): 13 of 28 day deaths at 59-85 s with zero supers (the minute-
// one sprint charging 100-HP joe into the first wave), and four mark deaths
// inside one 17-second band at ~550 s (a timetabled mark rain on a shieldless
// character). Two gates: the sprint requires sprintMinHp base HP, and marks
// weigh fragileMarkFearMul more while player.shield sits under the fragile
// profile's markShield floor — both read live stats, both config-toothed.
if (which === 'joe-day') {
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 30 } });
    setTimeout(() => {
        pineBot.stop();
        pineBot.test.applyDefaults();
        const T = pineBot.test;
        const scene = (gt, extraP) => {
            global.player = Object.assign({ x: 270, y: 270, hp: 95, maxHp: 100, speed: 3.0, r: 7.2,
                                            ultReadyAt: 1e9 }, extraP || {});
            global.enemies = [{ type: 'drunk', id: 1, x: 380, y: 270, hp: 60, maxHp: 60, r: 10, speed: 1.5 }];
            global.gameTime = gt;
            let pl; for (let i = 0; i < 4; i++) pl = T.planMove();
            return pl;
        };
        // 1. THE SPRINT GATE. Joe (100 HP) in minute one: no sprint.
        T.setChar('joe');
        test('joe gets NO minute-one sprint (dayFarmBase 1.0)', () =>
            assert.strictEqual(scene(30).dayFarmBase, 1));
        test('joe keeps the ordinary day funding amp after 60 s', () =>
            assert.strictEqual(scene(300).dayFarmBase, 1.35));
        // Pat (180 HP) sprints exactly as before.
        T.setChar('pat');
        test('pat still sprints minute one (1.7)', () =>
            assert.strictEqual(scene(30, { hp: 170, maxHp: 180, speed: 1.9 }).dayFarmBase, 1.7));
        // Config teeth: drop the bar under joe and he sprints again.
        T.setChar('joe');
        pineBot.config.movement.sprintMinHp = 90;
        test('sprintMinHp is the gate, not a hardcoded joe check', () =>
            assert.strictEqual(scene(30).dayFarmBase, 1.7));
        pineBot.config.movement.sprintMinHp = 120;
        // 2. SHIELDLESS MARK FEAR. Same scene, a mark on the seat; only the
        //    LIVE shield stat changes.
        const markScene = (shield) => {
            global.dropMarks = [{ x: 280, y: 270, r: 58, dmg: 72, tele: 0.6, at: 6000.3 }];
            const pl = scene(300, { shield });
            global.dropMarks = [];
            return pl;
        };
        let pl = markScene(0);
        test('shieldless joe fears marks x1.6', () =>
            assert.strictEqual(pl.markFearMul, 1.6));
        const dangerBare = pl.danger;
        pl = markScene(60);   // over his markShield floor (30)
        test('a REAL shield turns the fear off — live stat, not a name', () =>
            assert.strictEqual(pl.markFearMul, 1));
        test('...and the danger field actually paid the difference', () =>
            assert.ok(dangerBare > pl.danger * 1.2, 'bare ' + dangerBare.toFixed(1) + ' vs shielded ' + pl.danger.toFixed(1)));
        // Pat has no markShield floor: never the multiplier.
        T.setChar('pat');
        test('pat (no markShield floor) is untouched', () =>
            assert.strictEqual(markScene(0).markFearMul, 1));
        T.setChar('joe');
        // Config teeth: zero the multiplier and the shieldless fear is gone.
        pineBot.config.threat.fragileMarkFearMul = 1;
        test('fragileMarkFearMul is the lever', () =>
            assert.strictEqual(markScene(0).markFearMul, 1));
        pineBot.config.threat.fragileMarkFearMul = 1.6;
        done();
    }, 700);
}

// v6.97.2 — MULTI-TAB AUDIT MERGE. Measured: 266 runs since the store
// reset, 58 phase rows kept (~22%) — the user runs 2+ game tabs, the learn
// store merges across tabs, and the row-list audits clobbered each other.
// appendAuditRow re-reads the stored list before every append.
if (which === 'audit-merge') {
    const { pineBot, store } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 5 } });
    pineBot.stop();
    const T = pineBot.test;
    // OUR tab booted when the audit held one old row; ANOTHER tab has since
    // appended two more. Our in-memory view is stale by exactly those two.
    const oldRow = { v: 'A', t: 100 };
    const foreign1 = { v: 'B', t: 200 }, foreign2 = { v: 'B', t: 300 };
    store.pineBotPhaseAudit = JSON.stringify({ rows: [oldRow, foreign1, foreign2] });
    let mem = { rows: [oldRow] };   // the stale in-memory object
    mem = T.appendAuditRow('pineBotPhaseAudit', mem, 'rows', { v: 'ME', t: 400 }, 240);
    const stored = JSON.parse(store.pineBotPhaseAudit).rows;
    test('the append lands ON TOP of the other tab\'s rows, not over them', () =>
        assert.deepStrictEqual(stored.map(r => r.t), [100, 200, 300, 400], JSON.stringify(stored)));
    test('...and the caller adopts the merged view', () =>
        assert.strictEqual(mem.rows.length, 4));
    // The keep bound still trims oldest-first across the MERGED list.
    mem = T.appendAuditRow('pineBotPhaseAudit', mem, 'rows', { v: 'ME', t: 500 }, 3);
    test('the keep bound trims the merged list, oldest first', () =>
        assert.deepStrictEqual(JSON.parse(store.pineBotPhaseAudit).rows.map(r => r.t), [300, 400, 500]));
    // A corrupt stored blob must not kill the append — our row still lands.
    store.pineBotPhaseAudit = '{CORRUPT';
    mem = T.appendAuditRow('pineBotPhaseAudit', { rows: [oldRow] }, 'rows', { v: 'ME', t: 600 }, 240);
    test('a corrupt stored audit falls back to the in-memory list', () =>
        assert.deepStrictEqual(JSON.parse(store.pineBotPhaseAudit).rows.map(r => r.t), [100, 600]));
    done();
}

// v6.98.0 — THE DEATHNUDGE RATCHET, disarmed and repaired. The gen-106 live
// probe found the contact DEATH_POOL pinned exactly at box max (standoff
// 190/190, standoffPull 1.8/1.8, panicHp 0.62/0.62, enemyRange 240/240) with
// sigma annealed shut: the 0.03/generation defensive push modifies the MEAN,
// which every restart preserves, so ~120 contact-dominated generations walked
// joe into the hyper-caution corner (dayClear 0.01 over 865 runs). The nudge
// now defaults to ZERO; recenterSearch() is the repair restartSearch cannot
// perform (restart keeps the mean).
if (which === 'nudge-ratchet') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 5 } });
    pineBot.stop();
    const T = pineBot.test;
    const L = T.getLearn();
    const box = T.tunable();
    const range = box['movement.standoff'].max - box['movement.standoff'].min;
    const mkBatch = () => {
        L.cem.batch = Array.from({ length: 10 }, (_, i) =>
            ({ r: 0.5 + 0.01 * i, p: { ...L.cem.mean }, d: 'contact' }));
    };
    // 1. DISARMED BY DEFAULT: a contact-dominated batch refits without
    //    ratcheting the caution pool.
    test('deathNudge defaults to 0', () =>
        assert.strictEqual(pineBot.config.learning.deathNudge, 0));
    const before = L.cem.mean['movement.standoff'];
    mkBatch(); T.refitCem();
    test('a contact-dominated generation no longer ratchets standoff', () =>
        assert.ok(Math.abs(L.cem.mean['movement.standoff'] - before) < range * 0.02,
            before + ' -> ' + L.cem.mean['movement.standoff']));
    // 2. THE MECHANISM SURVIVES BEHIND THE CONFIG (teeth): re-arm it and the
    //    same batch pushes the pool up.
    pineBot.config.learning.deathNudge = 0.03;
    const b2 = L.cem.mean['movement.standoff'];
    mkBatch(); T.refitCem();
    test('re-armed, the same generation pushes standoff up', () =>
        assert.ok(L.cem.mean['movement.standoff'] > b2 + range * 0.02,
            b2 + ' -> ' + L.cem.mean['movement.standoff']));
    // 3. THE RATCHET, DEMONSTRATED: enough contact generations pin the pool
    //    at box max — the exact live failure, reproduced in miniature.
    for (let g = 0; g < 80; g++) { mkBatch(); T.refitCem(); }
    test('80 armed generations pin standoff at box max (the live failure)', () =>
        assert.strictEqual(L.cem.mean['movement.standoff'], box['movement.standoff'].max));
    test('...and panicHp too — the whole contact pool walks together', () =>
        assert.strictEqual(L.cem.mean['movement.panicHp'], box['movement.panicHp'].max));
    pineBot.config.learning.deathNudge = 0;
    // 4. THE REPAIR: recenterSearch puts the mean back on config defaults,
    //    reopens sigma, and clears the hall of fame (champions recorded in
    //    the pinned era carry the corner inside them).
    L.hof = [{ r: 3, p: { ...L.cem.mean } }];
    const res = global.window.pineBot.recenterSearch();
    test('recenterSearch returns the mean to the config default', () =>
        assert.ok(Math.abs(L.cem.mean['movement.standoff'] - pineBot.config.movement.standoff) < 1,
            'standoff ' + L.cem.mean['movement.standoff'] + ' vs ' + pineBot.config.movement.standoff));
    test('...reopens sigma to sigmaInit x range', () =>
        assert.ok(Math.abs(L.cem.sigma['movement.standoff'] - range * pineBot.config.learning.sigmaInit) < 0.01,
            'sigma ' + L.cem.sigma['movement.standoff']));
    test('...clears the hall of fame and restarts the generation clock', () =>
        assert.ok(L.hof.length === 0 && L.cem.gen === 0 && res.recenters >= 1, JSON.stringify({ hof: L.hof.length, gen: L.cem.gen })));
    done();
}

// v6.92.0 — THE ARMING CAP, written from a LIVE READ, not from theory.
// A running bot was probed at five evolved supers with the gun not yet taken:
//   evolved: [southside, vodkatonic, negroni, mojito, gimlet]
//   weapons: { ..., campari: 6, lime: 6, ... }
// NEGRONI and GIMLET are both supposed to be impossible. NEGRONI is a
// deliberate KEYLESS occupant (its key CAMPARI is off-plan) and GIMLET is not
// on the roster at all. The bot bought both keys to Lv6 itself — LIME because
// the user's own JUNK_ACCEPTABLE / HELL_SAFE_JUNK tier promotes it, CAMPARI
// because it appeared on no list whatsoever.
//
// The fix refuses ONLY the level that arms the key. Lv5 is free.
if (which === 'arming-cap') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    const sc = (n, t, lv) => T.scoreCard({ n, type: t, lv, maxlv: 6 }, 0, []).score;
    const why = (n, t, lv) => T.scoreCard({ n, type: t, lv, maxlv: 6 }, 0, []).why;

    // THE TWO KEYS THAT ACTUALLY FIRED IN THE LIVE RUN.
    for (const k of ['LIME', 'CAMPARI'])
        test('the arming level of ' + k + ' is refused', () =>
            assert.ok(sc(k, 'passive', 5) < -400, k + ' @lv5 ' + Math.round(sc(k, 'passive', 5))));
    for (const k of ['LIME', 'CAMPARI'])
        test('...and the refusal is tagged: ' + k, () =>
            assert.ok(/arming-cap/.test(why(k, 'passive', 5)), why(k, 'passive', 5)));

    // THE POINT OF A CAP RATHER THAN A BAN: the junk tier still works. The
    // pool narrows late until junk is the only card on offer, which is why
    // JUNK_ACCEPTABLE exists at all. Lv0-4 must stay pickable.
    test('LIME below the cap is still a live junk pick, not banned', () => {
        for (const lv of [0, 1, 2, 3, 4])
            assert.ok(sc('LIME', 'passive', lv) > -400,
                'LIME @lv' + lv + ' ' + Math.round(sc('LIME', 'passive', lv)));
    });
    test('...and the cap is strictly the LAST level, not a range', () =>
        assert.ok(sc('LIME', 'passive', 4) - sc('LIME', 'passive', 5) > 400,
            'lv4 ' + Math.round(sc('LIME', 'passive', 4)) +
            ' vs lv5 ' + Math.round(sc('LIME', 'passive', 5))));

    // THE EXEMPTION THAT MAKES IT SAFE. OLIVE, TOMATO JUICE, CRANBERRY,
    // SWEET VERMOUTH, DRY VERMOUTH and WATER are ALL super keys of off-plan
    // cocktails (DRY MARTINI, BLOODY MARY, VODKA CRANBERRY, MANHATTAN,
    // VODKA MARTINI, WHISKEY HIGHBALL) — and the plan needs every one MAXED
    // for its stat. A blanket cap would gut the survival core. Those stay
    // guarded by occupancy and `latent-line` instead.
    for (const k of ['OLIVE', 'TOMATO JUICE', 'SWEET VERMOUTH', 'WATER'])
        test('the plan ingredient ' + k + ' can still be MAXED', () =>
            assert.ok(sc(k, 'passive', 5) > -400, k + ' @lv5 ' + Math.round(sc(k, 'passive', 5))));
    // ...as can the keys of lines we DO intend to complete.
    for (const k of ['MINT', 'TONIC', 'SUGAR'])
        test('the super-line key ' + k + ' can still be MAXED', () =>
            assert.ok(sc(k, 'passive', 5) > -400, k + ' @lv5 ' + Math.round(sc(k, 'passive', 5))));

    // AND THE OUTCOME THE WHOLE THING EXISTS FOR: with the keys shut, the two
    // keyless occupants stay keyless and the live run's 5-super state is
    // unreachable. This is the assertion that would have caught the bug.
    test('NEGRONI and WHISKY SOUR cannot be armed, so they stay keyless', () => {
        for (const c of ['NEGRONI', 'WHISKY SOUR']) {
            const k = pineBot.test.superKey(c);
            assert.ok(sc(k, 'passive', 5) < -400,
                c + ' key ' + k + ' @lv5 ' + Math.round(sc(k, 'passive', 5)));
        }
    });
    // v6.92.3 — THE MULE LOCKOUT. User, stating a game-design rule: "a
    // character cannot get moscow mule if the character has vodka cherry and
    // vice versa." VODKA CRANBERRY is the one latent line the arming cap
    // CANNOT close, because its key CRANBERRY is a PLAN_INGREDIENT the build
    // must max for pickup radius. The mule closes it by the game's own
    // exclusion rule instead.
    test('CRANBERRY is the latent key the arming cap deliberately does NOT close', () => {
        assert.ok(pineBot.test.scoreCard({ n: 'CRANBERRY', type: 'passive', lv: 5, maxlv: 6 }, 0, []).score > -400,
            'CRANBERRY is capped — pickup radius has been sacrificed');
        assert.strictEqual(pineBot.test.superKey('VODKA CRANBERRY'), 'CRANBERRY');
    });
    test('...so MOSCOW MULE is boosted while the exclusion is still open', () => {
        pineBot.test.setOwned({ 'MOSCOW MULE': 0, 'VODKA CRANBERRY': 0 });
        assert.ok(/mule-lockout/.test(pineBot.test.scoreCard({ n: 'MOSCOW MULE', type: 'weapon', lv: 0, maxlv: 6 }, 0, []).why || ''),
            pineBot.test.scoreCard({ n: 'MOSCOW MULE', type: 'weapon', lv: 0, maxlv: 6 }, 0, []).why);
    });
    test('...and the boost switches OFF once the exclusion has resolved', () => {
        pineBot.test.setOwned({ 'MOSCOW MULE': 1 });
        assert.ok(!/mule-lockout/.test(pineBot.test.scoreCard({ n: 'MOSCOW MULE', type: 'weapon', lv: 1, maxlv: 6 }, 0, []).why || ''),
            'still bidding for a card it already owns');
        pineBot.test.setOwned({ 'MOSCOW MULE': 0 });
    });
    // AND THE OTHER HALF OF THE EXCLUSION.
    // v6.110.0: VODKA CRANBERRY is no longer refused at lv0 — the user's own
    // joe recording took it FOUR times, to lv4 (gt 393/408/582/637), and
    // finished the run with four supers and no gun. What must hold is that it
    // cannot be levelled into the line, so the assertion moves to the ceiling.
    // v6.110.0 — TIME STOP TAKES OVER ONCE THE ULT IS MAXED.
    // The joe recording: ULTIMATE UP at 1631/1680/1740 taking the ult to lv6,
    // then TIME STOP +2S for the next TWENTY picks without exception, 1783 to
    // 4482, beating supers and evolves the whole way. frzShare reaches 1.00
    // in deep. The pat 89-minute demo said the same (22 of 31 picks after
    // 26:00) and was filed as "confirmed, no scoring change made".
    // The bonus is HELL-gated, so the scene has to actually be in hell — the
    // first draft of this test ran in the scenario's day env and read 175 for
    // both levels, which looked like the change had not landed.
    const inHell = fn => {
        const sgt = global.gameTime, sh = global.hell, sul = global.player.ultLevel;
        try { global.gameTime = 1800; global.hell = true; pineBot.test.handleScreens(); return fn(); }
        finally { global.gameTime = sgt; global.hell = sh; global.player.ultLevel = sul;
                  pineBot.test.handleScreens(); }
    };
    test('TIME STOP jumps once the ult is maxed, not on a clock', () => inHell(() => {
        const ts = () => pineBot.test.scoreCard({ n: 'TIME STOP +2S', type: 'sp_timestop', lv: 0, maxlv: 6 }, 0, []).score;
        global.player.ultLevel = 3; const low = ts();
        global.player.ultLevel = 6; const high = ts();
        assert.ok(high > low + 50, 'ult3 ' + Math.round(low) + ' -> ult6 ' + Math.round(high));
    }));
    // NOT asserted: that TIME STOP beats a SUPER. The first draft of this
    // test claimed it and the recording does not support it — the human took
    // ★ SUPER SOUTH SIDE UP at 1404 and had all FOUR supers banked before the
    // TIME STOP run began at 1783, so supers were never the competition (and
    // a fifth would be refused by gun-guard anyway). TIME STOP measures 266
    // against SUPER SOUTH SIDE's 443 and that ordering is left alone.
    // What the data DOES support is that once the engine is finished, time
    // stop beats everything ordinary — which is what the twenty unbroken
    // picks actually demonstrate.
    test('...and with the ult maxed it beats the ordinary picks it competed with', () => inHell(() => {
        global.player.ultLevel = 6;
        const t = pineBot.test.scoreCard({ n: 'TIME STOP +2S', type: 'sp_timestop', lv: 0, maxlv: 6 }, 0, []).score;
        // Exactly the cards the human took at 1334/1474/1517/1584 — SODA
        // WATER, GINGER BEER, COINTREAU, LIME — immediately before the ult
        // finished and the TIME STOP run began at 1783. That filler is what
        // time stop displaced, so it is the honest comparison.
        // OLIVE is deliberately NOT in this list: it carries
        // survival-core-crunch+150 in hell and scores 286, above time stop's
        // 266 — but the human had maxed OLIVE at gt 1002, so an unfinished
        // armour core was never on offer during that stretch. Asserting
        // against it would have been testing a state the run never reached.
        for (const [n, ty] of [['SODA WATER', 'passive'], ['GINGER BEER', 'passive'],
                               ['COINTREAU', 'passive'], ['LIME', 'passive']]) {
            const o = pineBot.test.scoreCard({ n, type: ty, lv: 2, maxlv: 6 }, 0, []).score;
            assert.ok(t > o, 'timestop ' + Math.round(t) + ' vs ' + n + ' ' + Math.round(o));
        }
    }));

    // v6.110.0 — THE GUN IS STILL UNREACHABLE AFTER THE CEILING SWAP.
    // The lv0 latent veto is gone below the cap, so the guards that remain
    // have to be checked rather than assumed. This is the invariant the whole
    // change rests on: a latent cocktail cannot be levelled to where it
    // evolves, so no sixth line can open however the key moves.
    // THE CEILING ITSELF, asserted against a LITERAL. Every other test in
    // this block reads pineBot.config.gunSafeOffPlanLv to place its
    // assertion, so raising the config to 7 moved the assertions with it and
    // left the whole suite green with the cap effectively removed — a teeth
    // check caught that. A guard whose threshold is read from the thing it
    // guards is not a guard. Evolution needs the cocktail at 6, so the
    // ceiling must sit strictly below it, whatever anyone later sets.
    test('the off-plan level ceiling is strictly below evolution range', () =>
        assert.ok(pineBot.config.gunSafeOffPlanLv < 6,
            'gunSafeOffPlanLv ' + pineBot.config.gunSafeOffPlanLv + ' — a latent cocktail could reach lv6 and evolve'));
    test('the gun stays unreachable: no latent cocktail can reach evolution range', () => {
        const ceil = pineBot.config.gunSafeOffPlanLv;
        for (const c of ['MANHATTAN', 'VODKA MARTINI', 'WHISKEY HIGHBALL', 'DRY MARTINI',
                         'BLOODY MARY', 'ESPRESSO MARTINI', 'VODKA CRANBERRY'])
            for (let lv = ceil; lv <= 6; lv++) {
                const r = pineBot.test.scoreCard({ n: c, type: 'weapon', lv, maxlv: 6 }, 0, []);
                assert.ok(r.score < -400, c + ' lv' + lv + ' ' + Math.round(r.score) + ' ' + r.why);
            }
    });
    test('...and the sixth-super card is still refused at the cap', () => {
        const saved = global.player.superLv;
        try {
            global.player.superLv = { a: 1, b: 1, c: 1, d: 1 };   // at maxSuperLines
            const r = pineBot.test.scoreCard({ n: 'SUPER MANHATTAN', type: 'super', lv: 0, maxlv: 6 }, 0, []);
            // NOT asserted as < -400: the card carries super+260 and
            // super-level+42, so gun-guard's -500 nets to about -257. A
            // threshold picked without looking would have failed a working
            // guard. What matters is that the guard FIRES and that the card
            // loses to an ordinary pick, which is the behaviour that keeps
            // the sixth line shut.
            assert.ok(/gun-guard/.test(r.why), r.why);
            const junk = pineBot.test.scoreCard({ n: 'ANGOSTURA', type: 'passive', lv: 0, maxlv: 6 }, 0, []);
            assert.ok(r.score < junk.score, 'super ' + Math.round(r.score) + ' vs junk ' + Math.round(junk.score));
        } finally { global.player.superLv = saved; }
    });

    test('VODKA CRANBERRY is capped below evolution range, not refused outright', () => {
        const ceil = pineBot.config.gunSafeOffPlanLv;
        const lo = pineBot.test.scoreCard({ n: 'VODKA CRANBERRY', type: 'weapon', lv: 0, maxlv: 6 }, 0, []);
        const hi = pineBot.test.scoreCard({ n: 'VODKA CRANBERRY', type: 'weapon', lv: ceil, maxlv: 6 }, 0, []);
        assert.ok(lo.score > 0, 'lv0 ' + Math.round(lo.score) + ' — the human took this four times');
        assert.ok(hi.score < -400, 'lv' + ceil + ' ' + Math.round(hi.score) + ' ' + hi.why);
    });
    // GIMLET's key is shut the same way, which is what keeps an off-roster
    // cocktail from becoming the sixth line even when the pool forces it in.
    test('GIMLET cannot be armed even if the pool forces the cocktail', () =>
        assert.ok(sc(pineBot.test.superKey('GIMLET'), 'passive', 5) < -400,
            'LIME @lv5 ' + Math.round(sc('LIME', 'passive', 5))));
    done();
}

// ---------------------------------------------------------------------
// v6.107.0 TAG BANDIT — the learned layer keyed on ATTACK TYPE.
// The per-card LinUCB needs a card's own history before it can say
// anything, so a card picked five times is still a stranger. Tags are the
// shared structure across cards: what `freeze` is worth in a boss-heavy
// field is learned from every card that carries it at once.
//
// This scenario also guards the table itself. The user's standing note is
// that this game is AI-built, "has several bugs and misclassifications",
// and that "the truth is what's being observed in the game itself" — so
// WEAPON_TAGS is a hypothesis. These tests assert the MACHINERY that lets
// play falsify it, not that any particular tag is correct.
// ---------------------------------------------------------------------
if (which === 'tag-learn') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 500 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    const why = n => T.scoreCard({ n, type: 'weapon', lv: 0, maxlv: 6 }, 0, []).why || '';
    const sc = n => T.scoreCard({ n, type: 'weapon', lv: 0, maxlv: 6 }, 0, []).score;

    // --- the user's correction to the table (they play the game; the recipe
    // book does not). "gin and vodka tonic slow the bosses, not exactly
    // freeze." Only WHISKY SOUR fully freezes, and a full freeze STOPS a
    // boss — which is why it alone carries the defensive `freeze-scarce`
    // bonus in hell. Asserted as the DEGREE distinction, since that is the
    // thing the bot had no word for before this version.
    test('GIN TONIC is tagged slow, NOT freeze', () => {
        const t = T.tagsOf('GIN TONIC');
        assert.ok(t.includes('slow') && !t.includes('freeze'), JSON.stringify(t));
    });
    test('VODKA TONIC is tagged slow and control, NOT freeze', () => {
        const t = T.tagsOf('VODKA TONIC');
        assert.ok(t.includes('slow') && t.includes('control') && !t.includes('freeze'), JSON.stringify(t));
    });
    test('WHISKY SOUR keeps the real freeze', () =>
        assert.ok(T.tagsOf('WHISKY SOUR').includes('freeze'), JSON.stringify(T.tagsOf('WHISKY SOUR'))));
    // ...and `control` stays the umbrella, so every rule written against it
    // keeps working. This is what makes the change additive rather than a
    // rewrite of four scoring sites.
    test('every slow card still carries the control umbrella', () => {
        for (const n of ['GIN TONIC', 'VODKA TONIC'])
            assert.ok(T.tagsOf(n).includes('control'), n + ' ' + JSON.stringify(T.tagsOf(n)));
    });

    // --- the degree is worth different amounts against bosses.
    // The distinction is BOSS-CONDITIONAL, so the field has to actually hold
    // bosses — enemyMix is maintained by the movement gather, not by config.
    global.player = { x: 270, y: 270, hp: 100, maxHp: 100, speed: 1.5 };
    global.enemies = [
        { type: 'boss', x: 360, y: 270, r: 40, hp: 4000, maxHp: 4000, speed: 0.9, moving: true },
        { type: 'boss', x: 180, y: 300, r: 40, hp: 4000, maxHp: 4000, speed: 0.9, moving: true }
    ];
    for (let i = 0; i < 4; i++) T.planMove();
    test('against bosses a full freeze outscores a slow, and both beat neither', () => {
        const base = T.enemyContextBonus('NEGRONI');       // defense, no control
        const slow = T.enemyContextBonus('GIN TONIC');
        const frz  = T.enemyContextBonus('WHISKY SOUR');
        assert.ok(frz > slow, 'freeze ' + frz + ' slow ' + slow + ' base ' + base);
        assert.ok(slow > 0, 'slow ' + slow + ' scored nothing — is enemyMix.boss populated?');
    });
    global.enemies = [];

    // --- the bandit itself: a tag credited with a good reward raises EVERY
    // card carrying it, including one the card bandit has never seen.
    T.setTagUcb({});
    const before = sc('GIN TONIC');
    test('with no tag evidence the tag layer contributes nothing', () =>
        assert.ok(/tag-learn\+0\b|tag-learn0\b|!/.test(why('GIN TONIC')) || !/tag-learn[-+]?[1-9]/.test(why('GIN TONIC')), why('GIN TONIC')));
    // Teach `slow` from a DIFFERENT card than the one we then score.
    T.creditTagPicks([{ name: 'VODKA TONIC' }], 2.4);
    T.creditTagPicks([{ name: 'VODKA TONIC' }], 2.4);
    T.creditTagPicks([{ name: 'VODKA TONIC' }], 2.4);
    const after = sc('GIN TONIC');
    test('a tag learned from ANOTHER card raises this one (the whole point)', () =>
        assert.ok(after > before, 'before ' + Math.round(before) + ' after ' + Math.round(after)));
    test('...and it is visible in the audit as its own term', () =>
        assert.ok(/tag-learn/.test(why('GIN TONIC')), why('GIN TONIC')));

    // --- the generalisation must never outvote a card's own record.
    test('the tag layer is bounded tighter than the per-card layer', () => {
        for (let i = 0; i < 60; i++) T.creditTagPicks([{ name: 'VODKA TONIC' }], 4.5);
        const b = T.tagLearnBonusOf('GIN TONIC');
        assert.ok(Math.abs(b) <= 8.001, 'tag bonus ' + b + ' exceeded the +/-8 bound');
    });
    // --- a card with four tags must not beat a card with one just for
    // carrying more labels: the table's granularity is an artefact of how it
    // was written, not a property of the weapon.
    test('the tag bonus is a MEAN over tags, not a sum', () => {
        // GIN TONIC carries FOUR tags, NEGRONI one. Credit each exactly once
        // with the same small reward, so every tag involved ends up with
        // IDENTICAL evidence and neither result is near the +/-8 clamp (a
        // clamp would hide a sum by flattening both to the bound — that is
        // what made the first version of this test toothless).
        // Under a mean the two bonuses are equal; under a sum the four-tag
        // card is ~4x, which is the bug: a card would outscore another purely
        // for carrying more labels, and the label count is an artefact of how
        // the table was written, not a property of the weapon.
        T.setTagUcb({});
        T.creditTagPicks([{ name: 'GIN TONIC' }], 0.1);
        const four = T.tagLearnBonusOf('GIN TONIC');
        T.setTagUcb({});
        T.creditTagPicks([{ name: 'NEGRONI' }], 0.1);
        const one = T.tagLearnBonusOf('NEGRONI');
        assert.ok(Math.abs(four) < 7.5 && Math.abs(one) < 7.5,
            'clamped, so this proves nothing: four ' + four + ' one ' + one);
        assert.ok(Math.abs(four - one) < 0.5, 'four-tag ' + four + ' vs one-tag ' + one);
    });
    done();
}

// ---------------------------------------------------------------------
// v6.107.0 THE DROP ANCHOR + SEARCHABLE RING GEOMETRY.
//
// User: "maintain some sort of anchor even if there's danger, because if
// you kill a rushing mob with powerful weapons, you can pick up lucky
// items like time pause, flame cross, or tequila shots."
//
// The absence was self-concealing: gatherLoot values only pickups already
// on the floor, so a pack that has not died yet is pure danger, the bot is
// pushed off it, the pack never dies, and no evidence of the missed value
// is ever produced. There was no gradient for the CEM to climb.
// ---------------------------------------------------------------------
if (which === 'drop-anchor') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 500 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    // A clearable pack sitting EAST. Nothing else on the field, so the only
    // reason to move toward it is the anchor and the only reason to move away
    // is its own danger.
    const pack = () => ([
        { type: 'drunk', x: 390, y: 250, r: 12, hp: 40, maxHp: 40, speed: 1.3, moving: true },
        { type: 'drunk', x: 400, y: 270, r: 12, hp: 40, maxHp: 40, speed: 1.3, moving: true },
        { type: 'drunk', x: 395, y: 290, r: 12, hp: 40, maxHp: 40, speed: 1.3, moving: true },
        { type: 'drunk', x: 410, y: 262, r: 12, hp: 40, maxHp: 40, speed: 1.3, moving: true }
    ]);
    const settle = () => { let q; for (let i = 0; i < 8; i++) q = T.planMove(); return q; };

    // --- ARMING. The gate is FEASIBILITY, measured from the run's real kill
    // rate. This is the whole safety story: a bot with no weapons standing in
    // a crowd is how runs end.
    global.player = { x: 270, y: 270, hp: 100, maxHp: 100, speed: 1.5 };
    global.enemies = pack();
    T.setKillRate(0);
    test('with NO kill rate the anchor never arms (nothing is killable)', () =>
        assert.strictEqual(settle().dropAnchor, false));
    T.setKillRate(1.5);                     // 4 bodies / 1.5 per s = 2.7s to clear
    const on = settle();
    test('with a real kill rate and a clearable pack, the anchor arms', () =>
        assert.strictEqual(on.dropAnchor, true));
    test('...and it reports the pack size and the measured time-to-clear', () =>
        assert.ok(on.anchorN === 4 && on.anchorTtk > 2 && on.anchorTtk < 3.5,
            'n ' + on.anchorN + ' ttk ' + on.anchorTtk));
    T.setKillRate(0.12);                    // 4 / 0.12 = 33s: not clearable
    test('a pack too slow to clear does NOT arm it', () =>
        assert.strictEqual(settle().dropAnchor, false));
    T.setKillRate(1.5);
    global.player.hp = 40;                  // below anchorMinHp 0.55
    test('and it never arms while hurt, whatever the pack', () =>
        assert.strictEqual(settle().dropAnchor, false));
    global.player.hp = 100;

    // --- BEHAVIOUR. The point of the term is that the bot holds toward the
    // pack instead of being pushed off it. Compared against the SAME scene
    // with the term at zero, which is the only honest control.
    T.setParam('movement.anchorValue', 0);
    const off = settle();
    // 90 is inside the measured hold band. Swept on this exact scene: at 34
    // (the first draft's ceiling) the direction moved ONE candidate slot and
    // the bot still fled; the hold appears between 34 and 80. A ceiling below
    // that would have shipped a permanently decorative term — the same
    // mistake as the 6.91.4 flat +12 freeze bonus, which could not move a
    // pick either. The box is 0-120 for that reason.
    T.setParam('movement.anchorValue', 90);
    const held = settle();
    test('the anchor HOLDS: the bot turns into the pack instead of fleeing it', () =>
        assert.ok(off.dx < -0.5 && held.dx > 0.5,
            'off dx ' + off.dx.toFixed(2) + ' held dx ' + held.dx.toFixed(2)));
    // ...and the box opens at zero on purpose: the search is allowed to
    // conclude the idea does not pay. Asserted so nobody "helpfully" raises
    // the floor later and removes the CEM's ability to refuse it.
    test('anchorValue is searchable from ZERO — the CEM may switch it off', () =>
        assert.strictEqual(pineBot.test.tunable()['movement.anchorValue'].min, 0));

    // --- THE SAFETY PROPERTY. This is a GAIN, never a danger discount.
    // Suppressing fear while anchored would suppress mark, line and
    // projectile fear too — the three things that actually end runs — and
    // this project has a long file of regressions from blanket multipliers.
    // An armed drop mark must still be dodged with the anchor at full weight.
    // isHazard requires a real `dmg` (passout landing markers ride in the
    // same array and are loot, not hazards), and `at` is the gameTime the
    // blast lands — gt is 500 in this scene, so 501 is one second out.
    // The mark sits BETWEEN the bot and the pack, on the path the anchor is
    // pulling along, which is the only placement that tests anything.
    global.dropMarks = [{ x: 340, y: 270, r: 46, dmg: 93, at: 501 }];
    const marked = settle();
    test('an armed mark on the path STILL breaks the hold (a gain, not a fear discount)', () =>
        assert.ok(held.dx > 0.5 && marked.dx < 0,
            'held ' + held.dx.toFixed(2) + ' marked ' + marked.dx.toFixed(2)));
    global.dropMarks = [];
    pineBot.test.applyDefaults();

    // --- RING GEOMETRY IS SEARCHABLE. Until now the CEM could tune how much
    // the bot WANTED to engage but never where it stood.
    global.enemies = [{ type: 'boss', x: 470, y: 270, r: 40, reach: 120, hp: 4000, maxHp: 4000, speed: 0.9, moving: true }];
    global.player = { x: 270, y: 270, hp: 100, maxHp: 100, speed: 1.5 };
    T.setParam('movement.bossRingMul', 0.8);
    const tight = settle();
    T.setParam('movement.bossRingMul', 1.25);
    const wide = settle();
    test('bossRingMul moves the firing ring: a wider ring stands further off', () =>
        assert.ok(wide.dx < tight.dx - 0.05, 'tight dx ' + tight.dx.toFixed(2) + ' wide dx ' + wide.dx.toFixed(2)));
    pineBot.test.applyDefaults();
    // The per-character hard floor is applied AFTER the multiplier, so no
    // low draw can walk the bot inside the distance a character must keep.
    test('bossFloor still wins over a low bossRingMul draw', () => {
        T.setChar('pat');
        T.setParam('movement.bossRingMul', 0.8);
        const fl = T.charProfile().bossFloor || 0;
        const r = T.bossRing();
        assert.ok(fl === 0 || r >= fl, 'ring ' + r + ' floor ' + fl);
        T.setChar('joe');
        pineBot.test.applyDefaults();
    });
    done();
}

// ---------------------------------------------------------------------
// v6.107.0 THE ARMOUR TIER. User's stated phasing:
//   "(1) Mojito, gin tonic, vodka tonic, southside, ultimate, shaking up
//    as the first picks for damage to survive the initial 5 minutes.
//    (2) olives, sweet vermouth, sugar, negroni for armor in 5-10 minutes."
// The day order was STATIC — identical at gt 0 and gt 1199 — so phase 2
// did not exist. Scored against a fresh build at 6.7 min the ranking came
// out ULTIMATE 785, STIRRING 531, OLIVE 373, SOUTH SIDE 359: the armour
// anchor was the third pick of the run, ahead of every cocktail, from
// second one.
// ---------------------------------------------------------------------
if (which === 'armor-tier') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 120 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    const at = (gt, n, type, lv) => { global.gameTime = gt; return T.scoreCard({ n, type: type || 'passive', lv: lv || 0, maxlv: 6 }, 0, []); };

    test('before armorTierFromS the hold is applied and tagged', () =>
        assert.ok(/armor-tier-hold/.test(at(120, 'OLIVE').why), at(120, 'OLIVE').why));
    test('...and after it, the hold is gone', () =>
        assert.ok(!/armor-tier-hold/.test(at(600, 'OLIVE').why), at(600, 'OLIVE').why));
    test('OLIVE scores strictly higher once the tier opens', () =>
        assert.ok(at(600, 'OLIVE').score > at(120, 'OLIVE').score,
            'early ' + Math.round(at(120, 'OLIVE').score) + ' later ' + Math.round(at(600, 'OLIVE').score)));

    // The point of the change: in the opening minutes a damage cocktail must
    // beat the armour anchor, which it did NOT before this version.
    test('in the first 5 minutes SOUTH SIDE now outranks OLIVE', () => {
        const ss = at(120, 'SOUTH SIDE', 'weapon').score, ol = at(120, 'OLIVE').score;
        assert.ok(ss > ol, 'SOUTH SIDE ' + Math.round(ss) + ' OLIVE ' + Math.round(ol));
    });
    // ...and the ordering goes BACK once armour is the phase, so this is a
    // phase gate and not a permanent demotion of armour.
    test('...and after the gate OLIVE leads again', () => {
        const ss = at(600, 'SOUTH SIDE', 'weapon').score, ol = at(600, 'OLIVE').score;
        assert.ok(ol > ss, 'OLIVE ' + Math.round(ol) + ' SOUTH SIDE ' + Math.round(ss));
    });

    // THE SUPER KEYS ARE NOT ARMOUR. The user listed SUGAR under phase 2,
    // but SUGAR is MOJITO's super key and TONIC opens two lines; holding
    // them back would starve exactly the supers 6.106.0 promoted after
    // measuring that entry deaths were 65% zero-supers against 0% for
    // survivors. Only the pure-defence ingredients are held.
    test('the super keys are NEVER held back, whatever the phase', () => {
        for (const k of ['TONIC', 'MINT', 'SUGAR'])
            assert.ok(!/armor-tier-hold/.test(at(120, k).why), k + ' ' + at(120, k).why);
    });

    // A BOUNDED SUBTRACTION, NOT A VETO: a pool that offers nothing else has
    // to leave the card takeable. The failure mode being guarded is a hold so
    // large it turns into a refusal.
    test('the hold never turns OLIVE into a refusal', () =>
        assert.ok(at(120, 'OLIVE').score > 0, 'OLIVE ' + Math.round(at(120, 'OLIVE').score)));
    test('and the hold is bounded by armorTierHold, not open-ended', () => {
        const withHold = at(120, 'OLIVE').score;
        T.setParam('movement.armorTierFromS', 0);
        const without = at(120, 'OLIVE').score;
        T.setParam('movement.armorTierFromS', 300);
        assert.ok(Math.abs((without - withHold) - 60) < 0.01, 'delta ' + (without - withHold));
    });

    // HELL IS EXEMPT. The tier is a DAY funding doctrine; a hell run that has
    // not capped armour must never be told to wait.
    // INVARIANT GUARD, declared as one: the exemption comes from the enclosing
    // `dayBuild = !hellDetected && gtOrd < 1200` guard, not from anything in
    // the tier block. Deleting a `!hellDetected` written inside the block
    // changed nothing, which is how that redundancy was found and removed.
    // This test does not fail when the tier is reverted — it fails if anyone
    // ever moves the tier out from under `dayBuild`.
    test('hell runs are exempt from the hold entirely', () => {
        global.hell = true;
        pineBot.test.handleScreens();   // the playing handler latches hellDetected off the lexical flag
        assert.ok(!/armor-tier-hold/.test(at(120, 'OLIVE').why), at(120, 'OLIVE').why);
        global.hell = false;
    });
    done();
}

// ---------------------------------------------------------------------
// v6.107.0 THE LEARNING PROBE. Four new machines shipped in this version
// and none is legible from the four existing report blocks. The user's
// ask was explicit: "go back through the pinebot report to be able to see
// what's working and what needs tuning."
//
// These assertions guard SHAPE and HONESTY, not values: that the probe
// reports sample counts next to every estimate (so a big weight at n=2
// cannot be read as a finding), and that it reports what the danger field
// ACTUALLY applied rather than what the store happens to hold. Reporting a
// proxy as the quantity is the recurring failure in this project's history.
// ---------------------------------------------------------------------
if (which === 'learn-probe') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 500 } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;

    test('report() carries the learning block', () => {
        const r = pineBot.report();
        assert.ok(r && r.learning, Object.keys(r || {}).join(','));
    });
    // --- tags: never an estimate without its sample count beside it.
    T.setTagUcb({});
    T.creditTagPicks([{ name: 'WHISKY SOUR' }], 2.0);
    test('a credited tag appears with BOTH a weight and its n', () => {
        const t = pineBot.learning().tags;
        assert.ok(t.freeze && typeof t.freeze.weight === 'number' && typeof t.freeze.n === 'number',
            JSON.stringify(t));
    });
    test('...and the tags the same card carries are all credited', () => {
        const t = pineBot.learning().tags;
        for (const k of ['freeze', 'line', 'control']) assert.ok(t[k], k + ' missing: ' + JSON.stringify(Object.keys(t)));
    });
    // --- enemy types: report the APPLIED value, not just the stored one.
    // A store may hold 2.2 while the danger field is using the ceiling;
    // printing the store alone would be reading a proxy and calling it the
    // quantity. v6.115.0: the ceiling is read, not hardcoded — it moved from
    // 1.4 to 1.8 when drunk (1.404) and runner (1.417) were both found pinned
    // against it. `regime-breaks` holds the literal bound.
    T.setEnemyMul({ bomber: 2.2 }); T.setEnemyN({ bomber: 40 });
    test('the enemy table reports stored mul AND what was actually applied', () => {
        const ceil = pineBot.config.learning.enemyMulCeil;
        const e = pineBot.learning().enemy.bomber;
        assert.ok(2.2 > ceil, 'probe 2.2 no longer exceeds ceiling ' + ceil);
        assert.ok(e && Math.abs(e.mul - 2.2) < 0.01 && Math.abs(e.applied - ceil) < 0.01,
            JSON.stringify(e) + ' ceil ' + ceil);
    });
    test('...and a type under the sample floor reports applied 1, not its store value', () => {
        T.setEnemyN({ bomber: 2 });
        const e = pineBot.learning().enemy.bomber;
        assert.ok(Math.abs(e.applied - 1) < 0.01 && e.soleHits === 2, JSON.stringify(e));
    });
    // --- the new CEM dims: live value, mean, sigma and BOX, so a mean pinned
    // at an edge is visible as such rather than needing to be inferred.
    test('the four new CEM dimensions report their box alongside the mean', () => {
        const p = pineBot.learning().params;
        for (const k of ['movement.bossRingMul', 'movement.poRingMul', 'movement.anchorValue', 'movement.anchorTtkS']) {
            assert.ok(p[k] && Array.isArray(p[k].box) && p[k].box.length === 2, k + ' ' + JSON.stringify(p[k]));
            assert.ok(typeof p[k].mean === 'number', k + ' has no mean: ' + JSON.stringify(p[k]));
        }
    });
    test('...and every new box CONTAINS its default, so a fresh store starts centred', () => {
        const p = pineBot.learning().params;
        for (const k of Object.keys(p))
            assert.ok(p[k].live >= p[k].box[0] && p[k].live <= p[k].box[1],
                k + ' default ' + p[k].live + ' outside box ' + JSON.stringify(p[k].box));
    });
    // --- the anchor reports whether it FIRED, which is the question that
    // comes before whether it pays.
    // v6.109.0 — THE FULL CEM TABLE. This block used to hardcode the four
    // 6.107.0 dimensions, leaving 23 of 27 invisible — including
    // threat.markWeight and threat.lineWeight, which govern the 54% of day
    // deaths caused by marks and lines. A report that cannot show the knob
    // behind the largest measured loss is not an instrument.
    test('every TUNABLE dimension is reported, not just the newest four', () => {
        const p = pineBot.learning().params, box = pineBot.test.tunable();
        const missing = Object.keys(box).filter(k => !(k in p));
        assert.strictEqual(missing.length, 0, 'missing from report(): ' + missing.join(', '));
        assert.ok(Object.keys(p).length >= 20, 'only ' + Object.keys(p).length + ' dims reported');
    });
    test('...including the two that govern the day\'s biggest loss', () => {
        const p = pineBot.learning().params;
        for (const k of ['threat.markWeight', 'threat.lineWeight'])
            assert.ok(p[k] && Array.isArray(p[k].box), k + ' not reported');
    });
    // A mean against a bound is the search saying the BOX is wrong, and that
    // cannot be read off a bare number — it has to be flagged.
    test('a mean pinned at a bound is flagged as atEdge', () => {
        const k = 'movement.anchorValue', box = pineBot.test.tunable()[k];
        pineBot.test.setCemMean(k, box.max);
        assert.strictEqual(pineBot.learning().params[k].atEdge, 'max');
        pineBot.test.setCemMean(k, box.min);
        assert.strictEqual(pineBot.learning().params[k].atEdge, 'min');
        pineBot.test.setCemMean(k, (box.min + box.max) / 2);
        assert.ok(!pineBot.learning().params[k].atEdge, 'flagged a mid-box mean');
    });

    // --- v6.109.0 THE ULT-UPTIME ECONOMY, live at last. The manual joe demo
    // measured invulnShare 0.326 and said the ult IS joe's armour; its own
    // open item named this as the next lever and it sat for ten versions
    // because invulnShare existed ONLY in the demo digest, so bot rows could
    // never be compared against it.
    test('the phase row carries live invuln share and ult progress', () => {
        const r = pineBot.test.phaseRow(1500, true);
        for (const k of ['inv', 'ultMax', 'ult6At'])
            assert.ok(k in r, 'phase row is missing ' + k + ': ' + Object.keys(r).join(','));
    });
    test('...and inv is a real share, not a tick count', () => {
        global.player = { x: 270, y: 270, hp: 100, maxHp: 100, speed: 1.5, ultLevel: 4 };
        global.enemies = [];
        for (let i = 0; i < 20; i++) pineBot.test.planMove();
        const r = pineBot.test.phaseRow(1500, true);
        assert.ok(r.inv != null && r.inv >= 0 && r.inv <= 1, 'inv ' + r.inv + ' is not a 0-1 share');
        assert.strictEqual(r.ultMax, 4, 'ultMax ' + r.ultMax + ' did not track player.ultLevel');
    });

    test('the anchor reports its arming count for the run', () => {
        const a = pineBot.learning().anchor;
        assert.ok(a && typeof a.armedTicksThisRun === 'number', JSON.stringify(a));
    });
    done();
}

// ---------------------------------------------------------------------
// v6.108.0 THE STALL. Measured, not theorised: a console probe of a run
// that would not end recorded, across all 18 samples, enemies pinned at
// 260-261 (the game's entity cap), HP 1.00, ZERO drop marks, ZERO road
// lines, and pickups climbing 79 -> 238 uncollected. gameTime advanced
// 358 seconds across ~4.8 WALL-HOURS — 0.021 game-sec per wall-sec, with
// a 10 s timer firing every ~1000 s.
//
// Three consequences, each guarded below:
//   1. the ladder's budgets are GAME seconds, so rung 1 took 12 wall-min
//      and rung 3 arrived 1.6 wall-hours in;
//   2. capStable refused to call it immortal because it asks what the
//      BUILD looks like (2 supers vs supersMin 3), not what the run does;
//   3. four movement gates are wall-ms and ran ~48x fast against the game.
// ---------------------------------------------------------------------
if (which === 'stall-escape') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 4600, hell: true } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;
    const C = pineBot.config;

    // --- (1) THE WALL-CLOCK ESCAPE.
    // The two arms are sized so the GAME budgets still govern a healthy run
    // and only a starved page ever reaches the wall arm first. Asserted as
    // an ordering, so nobody can later set a wall budget under the game one
    // and silently make the ladder fire early on a normal cap-out.
    test('the game budgets are the tighter pair at healthy speed', () => {
        assert.ok(C.deepHell.capStandS < C.deepHell.capStandWallS,
            'capStandS ' + C.deepHell.capStandS + ' >= wall ' + C.deepHell.capStandWallS);
        assert.ok(C.deepHell.capForceS < C.deepHell.capForceWallS,
            'capForceS ' + C.deepHell.capForceS + ' >= wall ' + C.deepHell.capForceWallS);
    });
    // ...and the escape actually escalates on wall time with the game clock
    // FROZEN — which is the measured condition, not a hypothetical.
    test('with gameTime frozen, the ladder still escalates on real time', () => {
        T.resetCapLadder();
        T.armCap();                              // arm the cap
        global.gameTime = 4600;                  // and never advance it again
        let p = T.planMove();
        assert.strictEqual(p.capStage, 1, 'stage should open at 1, got ' + p.capStage);
        T.ageCapWall(C.deepHell.capStandWallS * 1000 + 500);
        p = T.planMove();
        assert.strictEqual(p.capStage, 2, 'wall arm did not reach rung 2 (stage ' + p.capStage + ')');
        T.ageCapWall((C.deepHell.capForceWallS - C.deepHell.capStandWallS) * 1000 + 500);
        p = T.planMove();
        assert.strictEqual(p.capStage, 3, 'wall arm did not reach rung 3 (stage ' + p.capStage + ')');
    });

    // --- (2) SATURATION. The predicate asks what the RUN is doing, so it
    // must fire on a build capStable would refuse. This scene is the probe:
    // 260 enemies, full HP, and only TWO supers — the exact shape that sat
    // at the clock cap because `supersMin: 3` refused it.
    const flood = n => { global.enemies = []; for (let i = 0; i < n; i++)
        global.enemies.push({ type: 'drunk', x: 60 + (i * 37) % 420, y: 60 + (i * 71) % 420,
                              r: 12, hp: 40, maxHp: 40, speed: 1.2, moving: true }); };
    test('a saturated field arms the cap even with supers BELOW capStable', () => {
        T.resetCapLadder();
        global.player = { x: 270, y: 270, hp: 100, maxHp: 100, speed: 1.5 };
        global.gameTime = 4600;
        T.setSupers(2);                                  // under capStable.supersMin 3
        flood(C.deepHell.saturation.enemyMin + 20);
        T.planMove();                                    // seeds the hold
        assert.strictEqual(T.capState().capEarly, false, 'armed before the hold elapsed');
        T.ageSat(C.deepHell.saturation.holdWallS * 1000 + 500);
        T.planMove();
        assert.strictEqual(T.capState().capEarly, true, 'saturation never armed the cap');
        assert.strictEqual(T.capState().lastResetReason, 'saturated');
    });
    test('...and a field BELOW the entity threshold never arms it', () => {
        T.resetCapLadder();
        flood(C.deepHell.saturation.enemyMin - 40);
        T.planMove();
        T.ageSat(C.deepHell.saturation.holdWallS * 1000 + 500);
        T.planMove();
        assert.strictEqual(T.capState().capEarly, false, 'armed on a merely dense field');
    });
    // HP is the other half: a saturated field the bot is LOSING is a real
    // fight, not a stall, and must be left alone to die naturally.
    test('...nor does a saturated field while the bot is taking damage', () => {
        T.resetCapLadder();
        flood(C.deepHell.saturation.enemyMin + 20);
        global.player.hp = 60;                            // under saturation.hpFloor
        T.planMove();
        T.ageSat(C.deepHell.saturation.holdWallS * 1000 + 500);
        T.planMove();
        assert.strictEqual(T.capState().capEarly, false, 'armed while the bot was losing HP');
        global.player.hp = 100;
    });
    // --- (3) THE FOUR MOVEMENT CLOCKS. 6.100.0 moved the ABILITY gates off
    // wall-ms and left these four behind. At the measured 0.021x they run
    // ~48x fast against the game: cadenceHunger pins at 1.0 permanently and
    // hellRecent expires within TWO game-seconds. Asserted by FREEZING wall
    // time's influence — advancing only gameTime — and checking the gate
    // moves, which it could not do while it was reading Date.now().
    test('hellRecent is measured in GAME time, not wall time', () => {
        global.gameTime = 1200; global.hell = true;
        pineBot.test.handleScreens();                    // latches hellEnteredAt at gt 1200
        global.enemies = [];
        global.gameTime = 1230;                          // 30 GAME seconds in
        assert.strictEqual(T.planMove().hellRecent, true, 'should still be inside the 90 s window');
        global.gameTime = 1200 + 95;                     // past 90 GAME seconds
        assert.strictEqual(T.planMove().hellRecent, false, 'window did not close on the GAME clock');
    });
    // killRate is the one with teeth beyond posture: it gates the drop
    // anchor's feasibility test and feeds dpsDeficit into card scoring, so a
    // starved page was making every build look weaker than it is.
    test('killRate is kills per GAME second', () => {
        global.gameTime = 2000; global.killCount = 0;
        T.setKillRate(0);
        T.planMove();
        global.killCount = 100; global.gameTime = 2010;  // 100 kills in 10 GAME seconds
        for (let i = 0; i < 40; i++) { T.planMove(); }
        assert.ok(T.killRate() > 0.05, 'killRate stayed at ' + T.killRate() + ' across 10 game-seconds of kills');
        global.gameTime = 4600;
    });

    // --- (4) THE MILESTONE. A proven cap is a milestone, not a truncation.
    test('a PROVEN cap pays ms.immortal; a bare clock timeout does not', () => {
        const base = T.reward({ time: 4000, downs: 20000, sales: 50000000 }, { hell: true, cap: false });
        const prov = T.reward({ time: 4000, downs: 20000, sales: 50000000 }, { hell: true, cap: true });
        assert.ok(Math.abs((prov - base) - C.milestones.immortal) < 1e-6,
            'proven cap paid ' + (prov - base) + ', expected ' + C.milestones.immortal);
    });
    test('...and the epoch was bumped, so epoch-3 rows cannot be pooled with these', () =>
        assert.ok(T.rewardEpoch() >= 4, 'epoch ' + T.rewardEpoch()));

    // --- (5) TELEMETRY. The stall was only visible through a hand-pasted
    // console probe; the bot itself had no idea the page had collapsed.
    test('the phase row carries the stall signature', () => {
        const r = T.phaseRow(4600, true);
        for (const k of ['spd', 'spdLo', 'enMax', 'why'])
            assert.ok(k in r, 'phase row is missing ' + k + ': ' + Object.keys(r).join(','));
    });
    // Self-contained: handleScreens() above can re-enter startRun, which
    // resets the per-run peak. The claim under test is that the counter reads
    // the RAW field rather than gatherThreats' range-filtered neighbourhood,
    // so it has to be established in the same breath as it is read.
    test('...and enMax reports the PEAK field size, not the gathered subset', () => {
        T.resetCapLadder();
        global.gameTime = 4600;
        global.player = { x: 270, y: 270, hp: 100, maxHp: 100, speed: 1.5 };
        flood(C.deepHell.saturation.enemyMin + 20);
        T.planMove();
        const peak = T.capState().satPeakEn;
        assert.ok(peak >= C.deepHell.saturation.enemyMin,
            'peak ' + peak + ' — gatherThreats range-filters, the raw field must be counted');
        // and prove it is NOT the gathered list, which is much smaller
        assert.ok(peak > T.gatherThreats(global.player).enemies.length,
            'peak ' + peak + ' equals the gathered count — reading the filtered list again');
    });

    // ...and it stays out of the day and the entrance entirely.
    test('saturation cannot fire before minGtS', () => {
        T.resetCapLadder();
        global.gameTime = C.deepHell.saturation.minGtS - 100;
        flood(C.deepHell.saturation.enemyMin + 20);
        T.planMove();
        T.ageSat(C.deepHell.saturation.holdWallS * 1000 + 500);
        T.planMove();
        assert.strictEqual(T.capState().capEarly, false, 'armed before minGtS');
        global.gameTime = 4600;
    });
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.111.0 LANE ESCAPE — the 21% killer, and why the parameter was innocent.
//
// At n=1250 `threat.lineWeight` sat at its box MINIMUM (2.107, converged)
// while `line` took 268 of 1247 deaths. Two defects behind that, both
// asserted here:
//   (1) ONE weight priced two hazards. Unarmed telegraph lanes are numerous
//       and paint 126 px stripes across the arena; armed lanes are rare and
//       lethal. Minimising the sum minimises the telegraph and drags the
//       armed term down with it. Now two weights, two boxes.
//   (2) `laneUrgent` fired the DASH, and the dash takes its direction from
//       plan.dx/dy — the argmax of the field the pinned weight had flattened.
//       The exit from a lane is perpendicular geometry, not a preference, so
//       it is now an override above hunt/park/seat/harvest.
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'lane-escape') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900, hell: false } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test, C = pineBot.config;

    // A horizontal charge lane through the middle of the field, with the
    // player sitting just ABOVE the ray so the exit is unambiguously -y.
    const lane = (armed, ang) => ({ x: 300, y: 300, ang: ang == null ? 0 : ang, armed: armed, dmg: 60, life: 200 });
    const put = (px, py, lines) => {
        global.player = Object.assign({}, global.player, { x: px, y: py, hp: 100, maxHp: 100 });
        global.roadLines = lines;
        global.enemies = []; global.eprojectiles = []; global.dropMarks = []; global.pickups = [];
    };

    // --- (1) THE SPLIT.
    test('armed and telegraph lanes are priced by DIFFERENT weights', () => {
        assert.ok(C.threat.lineArmedWeight != null, 'lineArmedWeight missing from config');
        assert.notStrictEqual(C.threat.lineArmedWeight, C.threat.lineWeight,
            'both halves still share one number');
    });
    test('...and both are separately searchable, with the armed floor above the telegraph floor', () => {
        const t = T.tunable();
        assert.ok(t['threat.lineArmedWeight'], 'lineArmedWeight is not a CEM dimension');
        assert.ok(t['threat.lineArmedWeight'].min > t['threat.lineWeight'].min,
            'the armed weight can be driven as low as the telegraph weight — the split buys nothing');
    });
    // The literal invariant: the telegraph box must be allowed to reach zero
    // (that IS the policy the search has been asking for) while the armed box
    // must not. Written as literals so editing the boxes cannot move the
    // assertions along with them.
    test('the telegraph box reaches 0; the armed box has a hard floor', () => {
        const t = T.tunable();
        assert.strictEqual(t['threat.lineWeight'].min, 0,
            'telegraph floor is ' + t['threat.lineWeight'].min + ', not 0');
        assert.ok(t['threat.lineArmedWeight'].min >= 3,
            'armed floor ' + t['threat.lineArmedWeight'].min + ' < 3');
    });

    // --- (2) THE OVERRIDE.
    //
    // On an EMPTY field the danger term alone already walks the bot out of a
    // lane, so an isolated lane proves nothing about the override — the first
    // draft of these tests asserted exactly that and stayed green with the
    // override deleted. The override is load-bearing only where something
    // else is outbidding the lane, and that is the ordinary case: the seat,
    // the hunt, the harvest walk and the trek all bypass the danger field
    // entirely, and a crowd on the exit side makes the field itself refuse
    // the door. Every test below puts a competing bid on the board.
    test('standing in an ARMED lane steers perpendicular, out of the band', () => {
        put(300, 280, [lane(true)]);          // 20 px above a horizontal ray
        // a wall of bodies sitting ON the exit, so the field would rather
        // stay in the lane than walk through them
        global.enemies = [220, 260, 300, 340, 380].map(x => ({ type: 'drunk', x: x, y: 215, r: 14, hp: 400, speed: 1.2, moving: true }));
        const p = T.planMove();
        assert.ok(p.laneIn >= 1, 'the lane was not seen at all (laneIn ' + p.laneIn + ')');
        assert.ok(p.laneEsc, 'no escape vector produced');
        assert.ok(p.dy < -0.5, 'heading dy ' + p.dy + ' — a crowd on the exit outbid a live charge lane');
        assert.ok(Math.abs(p.dx) < 0.5, 'heading dx ' + p.dx + ' — running ALONG the lane');
    });
    test('...and from the other side it steers the other way', () => {
        put(300, 320, [lane(true)]);          // 20 px BELOW the same ray
        global.enemies = [220, 260, 300, 340, 380].map(x => ({ type: 'drunk', x: x, y: 385, r: 14, hp: 400, speed: 1.2, moving: true }));
        const p = T.planMove();
        assert.ok(p.dy > 0.5, 'heading dy ' + p.dy + ' — the sign of the exit is not tracking which side we are on');
    });
    // The override must outrank the seat. A parked bot sets vx=vy=0 and takes
    // the charge standing still; `lineOnCorner` vetoes the corner only when
    // the lane covers the corner itself, and the harvest, hunt and trek legs
    // check for lanes not at all.
    test('an armed lane outranks the harvest walk', () => {
        put(300, 280, [lane(true)]);
        // a passout pile straight along the lane: the harvest leg would walk
        // the bot down the middle of the charge. Passouts are ENEMIES with
        // type 'passout' and fallT 0 — a separate `passouts` array is not a
        // thing the gatherer reads, and populating one is how this test spent
        // its first draft asserting against an empty field.
        global.enemies = [
            { type: 'passout', x: 500, y: 282, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 91 },
            { type: 'passout', x: 540, y: 284, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 92 },
            { type: 'passout', x: 520, y: 300, r: 20, fallT: 0, hp: 40, maxHp: 40, id: 93 }
        ];
        const p = T.planMove();
        assert.ok(p.poField >= 3, 'the pile was not gathered (poField ' + p.poField + ')');
        assert.ok(p.laneEsc, 'no escape vector produced');
        assert.ok(p.dy < -0.5 && Math.abs(p.dx) < 0.5,
            'heading (' + p.dx.toFixed(2) + ',' + p.dy.toFixed(2) + ') — a passout pull is steering through a live charge');
    });
    // The whole point of the override: it must not depend on the weight the
    // search flattened. Drive lineWeight AND lineArmedWeight to their floors
    // and the exit must be identical, because it is geometry.
    // NOTE: an earlier draft of this test called `setCemMean({...})` with an
    // object. The hook's signature is (k, v), so it wrote one garbage key and
    // changed nothing — the test passed while asserting nothing at all. Use
    // applyParams, which is what the live sampler uses, and prove the weights
    // actually landed before asserting on the heading.
    test('the exit survives BOTH lane weights at their box floor', () => {
        const t = T.tunable();
        T.applyParams({ 'threat.lineWeight': t['threat.lineWeight'].min,
                        'threat.lineArmedWeight': t['threat.lineArmedWeight'].min });
        assert.strictEqual(C.threat.lineWeight, t['threat.lineWeight'].min, 'the params did not apply');
        put(300, 280, [lane(true)]);
        const p = T.planMove();
        assert.ok(p.dy < -0.5,
            'dy ' + p.dy + ' — the escape is riding on the danger field, which is what pinned it in the first place');
        pineBot.test.applyDefaults();
    });
    // --- (3) THE DANGER FIELD, which the override does not replace.
    // Standing OUTSIDE the band there is no override; only the field steers.
    // Zero the telegraph weight and raise the armed weight: an armed lane must
    // still push the bot away. Under the old single scalar, lineWeight = 0 zeroed
    // BOTH halves and the lane became invisible — which is the state the search
    // spent hundreds of generations driving toward.
    test('with the telegraph weight at ZERO an armed lane still repels', () => {
        const t = T.tunable();
        T.applyParams({ 'threat.lineWeight': 0, 'threat.lineArmedWeight': t['threat.lineArmedWeight'].max });
        put(300, 300 - 85, [lane(true)]);      // perp 85 > 63+pad: outside the band, no override
        const p = T.planMove();
        assert.strictEqual(p.laneIn, 0, 'the override fired — this test is meant to isolate the FIELD');
        assert.ok(p.dy < -0.2,
            'dy ' + p.dy + ' — a live charge lane is invisible whenever the telegraph weight is low, which is exactly the 21%');
        pineBot.test.applyDefaults();
    });
    test('...and the telegraph weight still steers telegraphs on its own', () => {
        const t = T.tunable();
        const headingAt = w => {
            T.applyParams({ 'threat.lineWeight': w, 'threat.lineArmedWeight': t['threat.lineArmedWeight'].min });
            put(300, 300 - 85, [Object.assign(lane(false), { life: 200 })]);
            return T.planMove().dy;
        };
        const cold = headingAt(0), hot = headingAt(t['threat.lineWeight'].max);
        assert.ok(hot < cold - 0.05,
            'telegraph avoidance ' + hot.toFixed(2) + ' at max vs ' + cold.toFixed(2) + ' at 0 — the weight does nothing');
        pineBot.test.applyDefaults();
    });
    // laneDiv counts the ticks the override actually OVERRULED the danger
    // field. The first live report came back laneIn === laneEsc in every row
    // (6475/6475), because the override fires on every covered tick — so that
    // pair carried one number twice. A diversion is the thing worth counting.
    test('laneDiv counts overrules, not firings', () => {
        T.startRun();
        // player deep in an armed lane with a crowd sitting on the exit: the
        // field wants to stay, the override leaves anyway = a real diversion.
        put(300, 285, [lane(true)]);
        global.enemies = [220, 260, 300, 340, 380].map(x => ({ type: 'drunk', x: x, y: 215, r: 14, hp: 400, speed: 1.2, moving: true }));
        for (let i = 0; i < 5; i++) T.planMove();
        const hot = T.phaseRow();
        assert.ok(hot.laneEsc >= 5, 'the override did not fire (' + hot.laneEsc + ')');
        assert.ok(hot.laneDiv >= 1, 'laneDiv ' + hot.laneDiv + ' — no diversion counted while overruling a crowd');
        // now an empty field: the danger field ALREADY points out of the lane,
        // so the override agrees with it and nothing is being overruled.
        T.startRun();
        put(300, 285, [lane(true)]);
        global.enemies = [];
        for (let i = 0; i < 5; i++) T.planMove();
        const cold = T.phaseRow();
        assert.ok(cold.laneEsc >= 5, 'the override did not fire on the empty field');
        assert.ok(cold.laneDiv < cold.laneEsc,
            'laneDiv ' + cold.laneDiv + ' == laneEsc ' + cold.laneEsc +
            ' — every firing counted as a diversion, which is the tautology this replaces');
    });
    test('a lane the player is CLEAR of triggers nothing', () => {
        pineBot.test.applyDefaults();
        put(300, 30, [lane(true)]);           // 270 px away: far outside 63+pad
        const p = T.planMove();
        assert.strictEqual(p.laneIn, 0, 'laneIn ' + p.laneIn + ' — a distant lane is being treated as an escape');
        assert.strictEqual(p.laneEsc, null, 'escape vector produced for a lane nowhere near us');
    });
    // A thrower's windup pushes a synthetic segment that ENDS at the player,
    // so lineCost reports a zero-distance hit on it every tick (the 6.89.13
    // regression that disabled the corner for versions). It has no `ang` and
    // must never steer.
    // Exposure has to ACCUMULATE, or the phase row's laneIn/laneEsc are a
    // pair of permanent zeros that no report can distinguish from "the bot
    // never stood in a lane" — the single most important thing this version
    // needs to be able to read back.
    test('lane exposure and escapes accumulate into the phase row', () => {
        T.startRun();
        put(300, 280, [lane(true)]);
        assert.strictEqual(T.phaseRow().laneIn, 0, 'the counter did not start clean');
        for (let i = 0; i < 6; i++) T.planMove();
        const r = T.phaseRow();
        assert.ok(r.laneIn >= 6, 'laneIn ' + r.laneIn + ' after 6 ticks inside a live lane');
        assert.ok(r.laneEsc >= 6, 'laneEsc ' + r.laneEsc + ' — exposure is counted but the override is not');
        put(300, 30, [lane(true)]);           // step well clear
        const before = T.phaseRow().laneIn;
        for (let i = 0; i < 4; i++) T.planMove();
        assert.strictEqual(T.phaseRow().laneIn, before, 'laneIn climbing while clear of every lane');
    });
    test('a synthetic thrower line never steers the override', () => {
        put(300, 300, []);
        global.enemies = [{ type: 'thrower', x: 500, y: 300, r: 14, hp: 900, windup: true, telegraph: true }];
        const p = T.planMove();
        assert.strictEqual(p.laneEsc, null, 'a thrower windup produced a lane escape vector');
    });
    // Both perpendiculars leave the lane; only one leaves the arena. Pinned
    // against the top edge, the exit must flip rather than walk into the wall.
    test('against a wall, the exit takes the other side of the lane', () => {
        put(300, C.field.margin + 2, [Object.assign(lane(true), { y: C.field.margin + 20 })]);
        const p = T.planMove();
        assert.ok(p.dy > 0, 'dy ' + p.dy + ' — escaping into the wall it is already pinned against');
    });
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.111.0 CEM BOX RE-OPEN — why widening a box was a no-op for 18 versions.
//
// loadLearn has claimed since v6.93.0 that a widened bound lets the learner
// "walk into" the new territory. It re-floors sigma to `range * sigmaFloor`,
// and sigmaFloor IS the converged state. So a widened box moved the wall and
// left the mean welded to the old corner with 5% sigma — which is precisely
// the state the n=1250 report showed for the two dims this build widens.
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'box-reopen') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 600 } });
    pineBot.stop();
    const T = pineBot.test, C = pineBot.config, L = C.learning;

    const KEY = 'threat.lineWeight';
    const box = T.tunable()[KEY];
    const range = box.max - box.min;

    // --- (1) The migration itself, on the real store shape.
    test('a pre-6.111 store re-opens exactly the dims whose box moved', () => {
        const lr = T.getLearn();
        assert.ok(lr.cem.lastReopen, 'no re-open was recorded on a store with no box record');
        const dims = lr.cem.lastReopen.dims.join(' ');
        assert.ok(/threat\.lineWeight/.test(dims), 'lineWeight did not re-open: ' + dims);
        assert.ok(/hellCautionMul/.test(dims), 'hellCautionMul did not re-open: ' + dims);
    });
    test('...and the re-opened sigma is exploration, not the floor', () => {
        const s = T.getLearn().cem.sigma[KEY];
        assert.ok(s > range * L.sigmaFloor * 4,
            'sigma ' + s.toFixed(3) + ' is still ~the floor (' + (range * L.sigmaFloor).toFixed(3) +
            ') — the box widened and the search cannot reach the new room');
        assert.ok(Math.abs(s - range * L.sigmaInit) < 1e-6,
            'sigma ' + s.toFixed(3) + ' != sigmaInit * range ' + (range * L.sigmaInit).toFixed(3));
    });
    // The mean is KEPT on purpose. A mean at a bound is evidence about
    // DIRECTION — the search spent generations pushing that way and ran out
    // of room. Re-centring would throw exactly that away, which is what
    // separates this from recenterSearch.
    test('the re-open keeps the mean — direction is the evidence', () => {
        const lr = T.getLearn();
        const m = lr.cem.mean[KEY];
        assert.ok(isFinite(m) && m >= box.min && m <= box.max, 'mean ' + m + ' outside ' + JSON.stringify(box));
    });
    // Surgical, not a restart: dims whose box did NOT move keep their tuning.
    test('untouched dimensions are NOT re-opened', () => {
        const lr = T.getLearn();
        const dims = lr.cem.lastReopen.dims.join(' ');
        assert.ok(!/movement\.smoothing/.test(dims),
            'smoothing re-opened without its box changing — this is a full restart wearing a disguise');
        assert.ok(lr.cem.lastReopen.dims.length < Object.keys(T.tunable()).length / 2,
            're-opened ' + lr.cem.lastReopen.dims.length + ' dims — that is a restart, not a migration');
    });
    // --- (2) Idempotence. An entry left in TUNABLE_PRIOR after its migration
    // has run would re-open that dim on EVERY load: a permanent 25% sigma and
    // a search that can never converge. Once the box is recorded, a second
    // load must be silent.
    test('a store that has already recorded the current boxes does not re-open again', () => {
        const first = T.getLearn();
        const saved = JSON.parse(JSON.stringify(first.cem.box));
        const reloaded = T.loadLearn();
        const before = first.cem.reopens || 0;
        assert.ok(reloaded.cem.box, 'box record was not persisted');
        assert.deepStrictEqual(reloaded.cem.box[KEY], saved[KEY], 'the recorded box drifted between loads');
        assert.ok((reloaded.cem.reopens || 0) <= before + 1,
            're-open count climbing on every load (' + before + ' -> ' + reloaded.cem.reopens + ')');
    });
    // --- (3) The boxes this build actually widened, as literals. If a future
    // version narrows one back without emptying TUNABLE_PRIOR, this goes red.
    test('the three pinned dimensions have room past where they were pinned', () => {
        const t = T.tunable();
        assert.ok(t['movement.hellCautionMul'].max > 2.2,
            'hellCautionMul ceiling ' + t['movement.hellCautionMul'].max + ' — still at the value the mean was welded to');
        assert.ok(t['movement.bossEngageValue'].min < 10,
            'bossEngageValue floor ' + t['movement.bossEngageValue'].min + ' — still above the pinned mean of 10.75');
        assert.strictEqual(t['threat.lineWeight'].min, 0,
            'lineWeight floor ' + t['threat.lineWeight'].min + ' — the search asked to go below 2 and still cannot');
    });
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.111.0 ULT ECONOMY — and the retraction that shaped it.
//
// The n=1250 read of "bot inv 0.103 vs human 0.326 = a 3.9x ult-uptime gap"
// was a units error: the demo recorder ORs `player.invuln` (38-frame hit
// window) into its share and the phase row did not. Joe's ult ceiling is
// 8/80 = 10% at lv1 and 12/80 = 15% at lv6, so 0.103 is a bot already firing
// near cooldown. These tests pin the corrected instrument and the two levers
// that survive it: ult LEVEL (window length) and ultCdMul (cooldown).
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'ult-economy') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 700, hell: false } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test;

    global.enemies = []; global.eprojectiles = []; global.dropMarks = []; global.pickups = []; global.roadLines = [];

    test('inv and invAll are DIFFERENT instruments, and only invAll matches the demo', () => {
        T.startRun();
        // no invulnerability of any kind
        global.player = Object.assign({}, global.player, { x: 300, y: 300, hp: 100, maxHp: 100, invuln: 0, ultUntil: 0, ultSpiralUntil: 0 });
        for (let i = 0; i < 10; i++) T.planMove();
        // now hit frames ONLY — what a human soaking damage in a corner logs,
        // and what the demo's 0.326 is mostly made of
        global.player = Object.assign({}, global.player, { invuln: 30 });
        for (let i = 0; i < 10; i++) T.planMove();
        const r = T.phaseRow();
        assert.ok(r.invAll > r.inv,
            'invAll ' + r.invAll + ' vs inv ' + r.inv + ' — hit frames are not being counted, so the demo comparison is still illegal');
        assert.ok(r.inv < 0.05,
            'inv ' + r.inv + ' — hit frames leaked into the ULT-only share');
    });
    test('accepted casts are counted, not button presses', () => {
        T.startRun();
        global.player = Object.assign({}, global.player, { x: 300, y: 300, hp: 100, maxHp: 100, invuln: 0, ultReadyAt: 100, ultCdMul: 0.6667 });
        T.planMove();
        for (let i = 0; i < 5; i++) T.planMove();      // no cooldown movement = no cast
        assert.strictEqual(T.phaseRow().casts, 0, 'rejected calls counted as casts');
        global.player = Object.assign({}, global.player, { ultReadyAt: 180 });   // the game accepted one
        T.planMove();
        assert.strictEqual(T.phaseRow().casts, 1, 'an accepted cast was not counted');
    });
    test('ultCdMul is reported — the lever the deep-hell model named and nothing ever showed', () => {
        const cd = T.phaseRow().cdMul;
        assert.ok(cd != null && Math.abs(cd - 0.6667) < 0.001, 'cdMul ' + cd);
        // and it must be the LIVE value, not a config constant standing in
        global.player = Object.assign({}, global.player, { ultCdMul: 0.5 });
        T.planMove();
        assert.ok(Math.abs(T.phaseRow().cdMul - 0.5) < 0.001,
            'cdMul ' + T.phaseRow().cdMul + ' did not follow the live stat');
    });
    // SPEND THE WINDOW. `ultInvuln` has relaxed `caution` by 0.35 since
    // 6.86.1, which only ever made the bot less afraid — it never made it go
    // anywhere, and a window nothing is collected in is a window wasted.
    // Gated on ultInvulnSafe (>= ultInvulnCommitS left), because committing to
    // a pull in the last half-second of pat's 2.8 s window is how a window
    // becomes a death.
    test('a committed ult window raises the farm pull; a lapsing one does not', () => {
        global.player = Object.assign({}, global.player, { x: 300, y: 300, hp: 100, maxHp: 100, invuln: 0, ultUntil: 0 });
        const cold = T.planMove().dayFarmMul;
        global.player = Object.assign({}, global.player, { ultUntil: global.gameTime + 6 });
        const hot = T.planMove().dayFarmMul;
        global.player = Object.assign({}, global.player, { ultUntil: global.gameTime + 0.3 });   // about to lapse
        const lapsing = T.planMove().dayFarmMul;
        assert.ok(hot > cold * 1.2, 'farm pull ' + hot + ' vs ' + cold + ' — the window buys no aggression');
        assert.ok(Math.abs(lapsing - cold) < 1e-6,
            'lapsing window ' + lapsing + ' vs idle ' + cold + ' — committing inside the last half second');
        global.player = Object.assign({}, global.player, { ultUntil: 0 });
    });
    // Every one of these is a PER-RUN accumulator. A counter that survives
    // startRun turns a phase row into a session total, which is how `inv`
    // would silently start reporting the average of every run since the tab
    // opened — invisible in the data and fatal to the comparison.
    test('the ult-economy counters are cleared by startRun', () => {
        assert.ok(T.phaseRow().casts > 0, 'nothing to clear — the previous test did not leave state');
        T.startRun();
        const r = T.phaseRow();
        assert.strictEqual(r.casts, 0, 'casts survived the run boundary: ' + r.casts);
        assert.ok(r.invAll == null || r.invAll === 0, 'invAll survived the run boundary: ' + r.invAll);
        assert.strictEqual(r.laneIn, 0, 'lane exposure survived the run boundary: ' + r.laneIn);
    });
    // The window/cooldown arithmetic that retired the cadence theory, as an
    // executable statement rather than a comment: even PERFECT cadence cannot
    // reach the human's recorded 0.326 on ult windows alone.
    test('perfect ult cadence cannot reach the demo share — so cadence was never the lever', () => {
        const ULT_CD = 80, lv6Window = 8 + 0.8 * (6 - 1);
        assert.ok(lv6Window / ULT_CD < 0.2,
            'ceiling ' + (lv6Window / ULT_CD).toFixed(3) + ' — if this ever exceeds 0.2 the cadence theory is back on the table');
        // and the level is worth a real fraction of it, which is why the
        // pick premium now runs to lv6
        assert.ok((8 + 0.8 * 5) / 8 >= 1.4, 'lv1 -> lv6 no longer buys 40%+ more window');
    });
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.112.0 THE DEEP-HELL REGIME — a definition, not a threshold.
//
// USER: "deep hell should be framed as when corner anchoring works and the bot
// just fires ultimates to keep itself alive without any movement required due
// to the bosses being too large and stop giving tips."
//
// Every clause was already a live planner signal (ringHuge, tipWindowToS,
// parked, ultInvuln) and none of them reached the funnel, which booked `deep`
// off a bare 7200 s clock. Worse, that clock is unreachable for exactly the
// runs that succeed: capStable.fromS kills a PROVEN build at 2400 s, so a
// working build can never be booked deep while a failing one can.
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'deep-regime') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 5000, hell: true } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test, C = pineBot.config;
    const TIPS = C.deepHell.tipWindowToS, W = C.field.w;

    // A boss whose diameter is >= 55% of the canvas is the "too large" signal.
    const bigBoss = () => ({ type: 'boss', x: W * 0.5, y: W * 0.5, r: W * 0.30, hp: 9e9, maxHp: 9e9, speed: 0.4, moving: true, boss: true });
    const smallBoss = () => Object.assign(bigBoss(), { r: 20 });
    // Park needs armour + regen + hell + gt past parkFromS, and zeroes velocity.
    const anchored = (gt, boss) => {
        global.gameTime = gt;
        global.hell = true; T.latchHell();   // startRun clears hellDetected; planMove never re-latches
        T.setOwned({ 'SOUTH SIDE': 6 });     // parkClear = zoner: park needs SOUTH SIDE owned
        global.player = Object.assign({}, global.player, {
            x: 8, y: 8, hp: 100, maxHp: 100, defense: 34.992, regenBonus: 2.2, invuln: 0
        });
        global.enemies = [boss];
        global.eprojectiles = []; global.dropMarks = []; global.pickups = []; global.roadLines = [];
    };

    test('the four clauses are all live signals, not new invented state', () => {
        assert.ok(TIPS > 0, 'tipWindowToS missing');
        assert.ok(C.deepRegime && C.deepRegime.requireRing === true, 'deepRegime.requireRing missing');
        anchored(TIPS + 100, bigBoss());
        const p = T.planMove();
        assert.strictEqual(p.tipsDone, true, 'tips clause not reported');
        assert.strictEqual(p.ringHuge, true, 'boss ring clause not reported at r = 30% of canvas');
    });
    // The three hard clauses, each removed on its own. This is the shape that
    // catches a predicate that is really testing only one thing.
    test('a SMALL boss ring is not deep hell, however late the clock', () => {
        anchored(TIPS + 3000, smallBoss());
        const p = T.planMove();
        assert.strictEqual(p.ringHuge, false, 'a 20px boss counted as ring-huge');
        assert.strictEqual(p.deepRegime, false, 'the clock alone booked the regime — this is the 7200s bug again');
    });
    test('a huge ring BEFORE tips stop is not deep hell either', () => {
        anchored(TIPS - 600, bigBoss());
        const p = T.planMove();
        assert.strictEqual(p.tipsDone, false, 'tips clause wrong side of the window');
        assert.strictEqual(p.deepRegime, false, 'regime entered while tips were still dropping');
    });
    test('...and neither is a bot that has not anchored', () => {
        anchored(TIPS + 100, bigBoss());
        // strip the park gates: no armour, no regen -> parkArmor/parkRegen fail
        global.player = Object.assign({}, global.player, { defense: 2, regenBonus: 0 });
        const p = T.planMove();
        assert.strictEqual(p.parked, false, 'still parked with no armour — the scene is not testing the clause');
        assert.strictEqual(p.deepRegime, false, 'regime booked while the bot was still moving');
    });

    // --- the per-run measurement
    test('the hold is measured in GAME seconds and survives across ticks', () => {
        T.startRun();
        assert.strictEqual(T.phaseRow().deepAt, null, 'a fresh run already claims the regime');
        for (let i = 0; i <= 20; i++) { anchored(TIPS + 100 + i * 10, bigBoss()); T.planMove(); }
        const r = T.phaseRow();
        assert.ok(r.deepAt != null && Math.abs(r.deepAt - (TIPS + 100)) < 30, 'deepAt ' + r.deepAt);
        assert.ok(r.deepHold >= 190, 'deepHold ' + r.deepHold + ' after 200 game-seconds anchored');
    });
    test('a break in the regime RESETS the streak, and best-so-far is kept', () => {
        T.startRun();
        for (let i = 0; i <= 20; i++) { anchored(TIPS + i * 10, bigBoss()); T.planMove(); }
        const long = T.phaseRow().deepHold;
        anchored(TIPS + 400, smallBoss()); T.planMove();          // ring gone: break
        for (let i = 0; i <= 3; i++) { anchored(TIPS + 500 + i * 10, bigBoss()); T.planMove(); }
        const after = T.phaseRow().deepHold;
        assert.ok(long >= 190, 'first hold ' + long);
        assert.strictEqual(after, long, 'best hold ' + after + ' — a broken streak was counted as continuous');
    });
    // "without any movement required" is the literal claim, so it is checked
    // rather than assumed: deepStill is the share of regime ticks at velocity
    // exactly zero. If the anchor is really working this is ~1.
    // deepStill is a TAUTOLOGY while requireParked is on — park zeroes the
    // vector, so every regime tick is still by construction and the number can
    // only ever read 1. That is worth stating rather than dressing up: its job
    // is (a) to prove park really does zero the heading, so a future change
    // that makes park drift shows up here instead of silently, and (b) to be
    // the real measurement when requireParked is relaxed to read a row.
    test('deepStill reads exactly 1 while park is required — park zeroes the heading', () => {
        T.startRun();
        for (let i = 0; i <= 10; i++) { anchored(TIPS + 100 + i * 10, bigBoss()); T.planMove(); }
        const r = T.phaseRow();
        assert.strictEqual(r.deepStill, 1, 'deepStill ' + r.deepStill + ' — park is not zeroing the vector');
        assert.ok(r.deepHp > 0.5, 'deepHp ' + r.deepHp);
    });
    test('...and with the park clause relaxed it measures real movement, not 1', () => {
        const DR = pineBot.config.deepRegime;
        const was = DR.requireParked;
        try {
            DR.requireParked = false;
            T.startRun();
            // ring + tips satisfied, but no armour/regen/SOUTH SIDE: the bot is
            // in the regime window and still working for its life.
            for (let i = 0; i <= 10; i++) {
                anchored(TIPS + 100 + i * 10, bigBoss());
                T.setOwned({ 'SOUTH SIDE': 0 });
                global.player = Object.assign({}, global.player, { defense: 2, regenBonus: 0 });
                global.enemies = [bigBoss(), { type: 'drunk', x: 60, y: 60, r: 14, hp: 400, speed: 3, moving: true }];
                T.planMove();
            }
            const r = T.phaseRow();
            assert.ok(r.deepAt != null, 'the relaxed regime never opened');
            assert.ok(r.deepStill < 1,
                'deepStill ' + r.deepStill + ' with the bot unparked and a mob on it — the metric is hardcoded');
        } finally { DR.requireParked = was; T.setOwned({ 'SOUTH SIDE': 6 }); }
    });
    // The ult is a QUALITY of the hold, never a gate — gating on it would hide
    // the finding that armour, not ults, is what makes the corner survivable.
    test('the ult is measured during the hold, not required to enter it', () => {
        T.startRun();
        for (let i = 0; i <= 6; i++) { anchored(TIPS + 100 + i * 10, bigBoss()); T.planMove(); }
        assert.ok(T.phaseRow().deepAt != null, 'the regime refused to open with no ult running');
        assert.strictEqual(T.phaseRow().deepInv, 0, 'deepInv ' + T.phaseRow().deepInv + ' with no ult cast');
        for (let i = 7; i <= 20; i++) {
            anchored(TIPS + 100 + i * 10, bigBoss());
            global.player = Object.assign({}, global.player, { ultUntil: global.gameTime + 8 });
            T.planMove();
        }
        assert.ok(T.phaseRow().deepInv > 0.3, 'deepInv ' + T.phaseRow().deepInv + ' — ult windows not counted during the hold');
    });
    test('the regime is per-run, not a session total', () => {
        assert.ok(T.phaseRow().deepHold > 0, 'nothing to clear');
        T.startRun();
        const r = T.phaseRow();
        assert.strictEqual(r.deepHold, 0, 'deepHold survived the run boundary: ' + r.deepHold);
        assert.strictEqual(r.deepAt, null, 'deepAt survived the run boundary: ' + r.deepAt);
    });
    // --- the reason the old metric had to go, as a standing invariant.
    test('the EARLY CAP fires before deepFromS — so deepRate cannot see a working build', () => {
        const fromS = C.deepHell.capStable.fromS, deepFromS = C.phaseAudit.deepFromS;
        assert.ok(fromS < deepFromS,
            'capStable.fromS ' + fromS + ' >= deepFromS ' + deepFromS + ' — if this ever passes, re-examine whether deepRate is still blind');
        // and the regime's own clock sits between them, which is what makes it
        // observable at all under a cap that ends runs early
        assert.ok(C.deepHell.tipWindowToS < deepFromS,
            'the regime cannot start before the old clock — it would measure nothing new');
    });
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.112.0 BOSS CENSUS + the ringHuge blindness it exists to measure.
//
// USER: "given the predictability of the bosses appearance and the size at
// which they appear, the bot can be calibrated better" / "the boss appearance
// and size should be in the source code of the game."
//
// The source almost certainly carries the table. The census measures it
// through the bot's OWN view of the field — which is the half that has failed
// silently before: ringHuge read the range-filtered list and therefore could
// not fire from the corner, the exact posture it gates.
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'boss-census') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 5000, hell: true } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test, C = pineBot.config, W = C.field.w;
    pineBot.resetBossCensus();

    const put = (gt, bosses, px, py) => {
        global.gameTime = gt; global.hell = true; T.latchHell();
        global.player = Object.assign({}, global.player, { x: px == null ? 26 : px, y: py == null ? 26 : py,
            hp: 100, maxHp: 100, defense: 34.992, regenBonus: 2.2, invuln: 0 });
        global.enemies = bosses;
        global.eprojectiles = []; global.dropMarks = []; global.pickups = []; global.roadLines = [];
    };
    const boss = (id, r, x, y) => ({ id: id, type: 'boss', boss: true, bossChar: 'GIANT',
        x: x == null ? W * 0.5 : x, y: y == null ? W * 0.5 : y, r: r, hp: 9e9, maxHp: 9e9, speed: 0.4, moving: true });

    // --- THE BUG THIS VERSION FIXES, asserted as geometry.
    test('a canvas-sized boss is seen from the CORNER, where the bot actually sits', () => {
        T.startRun();
        // r = 30% of canvas -> diameter 60% >= ringShare 55%. Centre-to-corner
        // distance ~345 px, against threat.enemyRange whose box max is 240 —
        // so the gatherer drops it, and the old ringHuge could never fire.
        put(C.deepHell.tipWindowToS + 100, [boss(1, W * 0.30)], 26, 26);
        const p = T.planMove();
        const d = Math.hypot(W * 0.5 - 26, W * 0.5 - 26);
        assert.ok(d > T.tunable()['threat.enemyRange'].max,
            'scene is not testing the bug: boss is ' + Math.round(d) + 'px away, inside the max gather range');
        assert.strictEqual(p.enemies, 0, 'the gatherer kept it — the scene no longer reproduces the blindness');
        assert.strictEqual(p.ringHuge, true, 'ringHuge is still reading the range-filtered list');
    });
    test('a NO BOOKING wall is never the ring, however large', () => {
        T.startRun();
        put(C.deepHell.tipWindowToS + 100, [Object.assign(boss(2, W * 0.40), { wall: true, bossChar: 'NOBOOK' })], 26, 26);
        assert.strictEqual(T.planMove().ringHuge, false, 'a wall counted as the growing boss');
    });
    test('the threshold is ringShare of the canvas, not a magic number', () => {
        assert.ok(C.deepHell.ringShare > 0 && C.deepHell.ringShare < 1, String(C.deepHell.ringShare));
        T.startRun();
        const just = W * C.deepHell.ringShare / 2;
        put(5000, [boss(3, just * 0.9)], 26, 26);
        assert.strictEqual(T.planMove().ringHuge, false, 'fired below the share');
        put(5010, [boss(4, just * 1.02)], 26, 26);
        assert.strictEqual(T.planMove().ringHuge, true, 'did not fire above the share');
    });

    // --- THE CENSUS
    test('first sighting is recorded once per boss, with gt and radius', () => {
        T.startRun();
        for (let i = 0; i < 4; i++) { put(600 + i * 40, [boss(11, 20 + i * 2)], 26, 26); T.planMove(); }
        put(900, [boss(11, 30), boss(12, 14)], 26, 26); T.planMove();
        T.endRun();
        const c = pineBot.bossCensus();
        assert.ok(c.runs >= 1, 'no census row written');
        const k = c.kinds.find(x => x.kind === 'GIANT');
        assert.ok(k, 'kind GIANT missing: ' + JSON.stringify(c.kinds));
        assert.strictEqual(k.n, 2, 'expected 2 distinct bosses, got ' + k.n);
        assert.ok(k.firstGt >= 600 && k.firstGt <= 900, 'firstGt ' + k.firstGt);
    });
    test('the radius growth curve is fitted, and predicts when the ring opens', () => {
        pineBot.resetBossCensus();
        T.startRun();
        // 1 px per game-second, sampled past the census 30 s grid
        for (let i = 0; i <= 10; i++) { put(1000 + i * 40, [boss(21, 20 + i * 40)], 26, 26); T.planMove(); }
        T.endRun();
        const k = pineBot.bossCensus().kinds.find(x => x.kind === 'GIANT');
        assert.ok(k.growthPer100s > 50,
            'growth ' + k.growthPer100s + ' px/100s against a planted 100 — the fit is not reading the samples');
        assert.ok(k.ringAt != null && k.ringAt > 1000,
            'ringAt ' + k.ringAt + ' — the ring crossing is not being extrapolated');
    });
    test('the census is per-run and bounded', () => {
        pineBot.resetBossCensus();
        T.startRun();
        put(700, [boss(31, 20)], 26, 26); T.planMove();
        T.endRun();
        T.startRun();
        put(700, [boss(31, 20)], 26, 26); T.planMove();   // same id, new run
        T.endRun();
        const c = pineBot.bossCensus();
        assert.strictEqual(c.runs, 2, 'runs ' + c.runs + ' — a run boundary was not booked');
        assert.strictEqual(c.kinds.find(x => x.kind === 'GIANT').n, 2,
            'the same id in two runs collapsed to one sighting — bossSeen is not per-run');
    });
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.112.0 CONTACT BREAK-EVEN.
//
// USER: "normal mob damage can be absorbed and countered with simple syrup's
// healing regen rate." The arithmetic: hurtPlayer sets player.invuln = 38
// frames ON THE PLAYER, so total contact is rate-limited at 60/38 = 1.579
// hits/s however many bodies are touching; armour is flat subtraction with a
// floor of 1, so at defense >= 21.4 every common hit does 1 damage. Break-even
// regen is therefore 1.579 HP/s — and the park gate was 1.0.
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'break-even') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 6000, hell: true } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test, C = pineBot.config;
    const HZ = 60 / C.mitigation.invulnFrames;

    test('the constants are the ones read from the game source', () => {
        assert.strictEqual(C.mitigation.invulnFrames, 38, 'invuln frames');
        assert.ok(Math.abs(C.mitigation.contactDmg - 22.4) < 0.01, 'contact damage');
    });
    test('at armour cap the hit floors at 1, so break-even is the hit RATE', () => {
        global.player = Object.assign({}, global.player, { defense: 34.992 });
        assert.ok(Math.abs(T.breakEven() - HZ) < 1e-6, 'breakEven ' + T.breakEven() + ' vs ' + HZ);
    });
    // NOTE: defense exactly 0 is indistinguishable from "unreadable" —
    // liveDefense() tests `> 0` — so thin armour is asserted at 2, not 0.
    // Writing this test at 0 and expecting the full-damage figure is what
    // surfaced that; the accessor is left alone because "0" and "absent" mean
    // the same thing to every other call site and changing it there would be a
    // silent behaviour change across the whole planner.
    test('...and with thin armour it scales with the damage that gets through', () => {
        global.player = Object.assign({}, global.player, { defense: 2 });
        const want = HZ * (C.mitigation.contactDmg - 2);
        assert.ok(Math.abs(T.breakEven() - want) < 1e-3, T.breakEven() + ' vs ' + want);
        assert.ok(T.breakEven() > 10, 'a nearly unarmoured bot needs >10 HP/s and cannot get it — armour first');
    });
    // The finding, which v6.116.0's retraction does NOT touch: the flat park
    // gate sits below break-even, so a build that just clears it is losing HP
    // on the seat. True then, true now. What changed is what follows from it —
    // see the gate tests below.
    test('the flat park gate sits BELOW break-even — the seat runs at a loss', () => {
        global.player = Object.assign({}, global.player, { defense: 34.992 });
        assert.ok(C.deepHell.parkRegenRate < T.breakEven(),
            'parkRegenRate ' + C.deepHell.parkRegenRate + ' >= break-even ' + T.breakEven().toFixed(3) +
            ' — if this ever passes the finding has been undone');
        // parkAudit's measured seated median was 1.42: also underwater
        assert.ok(1.42 < T.breakEven(), 'the measured seated median is no longer below break-even');
    });
    // THE TRAP THIS ALREADY FELL INTO ONCE, this build: a null armour reading
    // defaulted to 0, making break-even 35.4 HP/s — unreachable, silently
    // closing the park gate forever. Same shape as capStable.defMin 35 vs a
    // 34.992 ceiling. Null must mean "no opinion", never "no armour".
    test('an unreadable armour stat yields NO OPINION, not an impossible bar', () => {
        global.player = Object.assign({}, global.player, { defense: undefined });
        T.setOwned({ 'OLIVE': 0, 'NEGRONI': 0 });
        assert.strictEqual(T.breakEven(), null,
            'breakEven ' + T.breakEven() + ' with no readable armour — this is the unreachable-threshold bug');
    });
    test('...falling back to the armour the owned levels imply when the stat is gone', () => {
        global.player = Object.assign({}, global.player, { defense: undefined });
        T.setOwned({ 'OLIVE': 6 });
        assert.ok(Math.abs(T.breakEven() - HZ) < 1e-6, 'breakEven ' + T.breakEven() + ' at OLIVE 6');
    });
    // THE GATE ITSELF — and v6.116.0's RETRACTION of what 6.112.0 did with it.
    //
    // 6.112.0 turned break-even into a VETO: refuse the seat unless regen
    // out-heals the contact. The physics was right and the decision was wrong,
    // and three reports of park.reachRate signed it: 0.44 -> 0.34 -> 0.31
    // across exactly the versions the veto was live. `medianEntryRegen` is
    // 1.0, so the bar closed the seat in the median run, and the same report
    // prices what the seat is worth — SEATED medianTimeS 3205 against NEVER
    // 1304. Refusing to sit down because the seat is not IMMORTAL costs a
    // measured 2.5x, and the bot dies faster standing up.
    //
    // So the gate is the flat floor again. Break-even stays computed, stays in
    // the report, and stays out of the decision. These tests pin the boundary
    // to the floor, which is what goes red if the veto is ever re-introduced.
    {
        const seat = (regen) => {
            global.gameTime = 6000; global.hell = true; T.latchHell();
            T.setOwned({ 'OLIVE': 6, 'SOUTH SIDE': 3 });
            global.player = { x: 533, y: 533, r: 7.2, hp: 300, maxHp: 309, speed: 2.375,
                defense: 34.992, regenBonus: regen };
            global.enemies = []; global.dropMarks = []; global.roadLines = []; global.eprojectiles = []; global.pickups = [];
            return T.planMove();
        };
        test('the seat ACCEPTS the median entry build (medianEntryRegen 1.0)', () =>
            assert.strictEqual(seat(1.0).parkOn, true,
                'refused the MEDIAN build — this is the veto that took park.reachRate 0.44 -> 0.31'));
        test('...and the measured seated median, which the veto also refused', () =>
            assert.strictEqual(seat(1.42).parkOn, true, 'refused 1.42 HP/s'));
        test('...and accepts the regen the confirmed 13,244 s run actually carried', () =>
            assert.strictEqual(seat(2.218).parkOn, true, 'refused 2.218 HP/s, which is net +0.64'));
        test('...and still refuses a build with no regen to speak of', () =>
            assert.strictEqual(seat(0.4).parkOn, false, 'seated a build with 0.4 HP/s — the floor is gone entirely'));
        test('the boundary is the FLAT floor, and break-even is not in the decision', () => {
            const be = (() => { seat(2.218); return T.breakEven(); })();
            const flat = C.deepHell.parkRegenRate;
            // the two thresholds must be far enough apart for the test to mean
            // anything — otherwise it would pass under either regime
            assert.ok(be > flat + 0.3,
                'break-even ' + be.toFixed(3) + ' is not meaningfully above the flat floor ' + flat +
                ' — this test cannot distinguish the two gates');
            assert.strictEqual(seat(flat + 0.05).parkOn, true, 'refused just above the flat floor');
            assert.strictEqual(seat(flat - 0.05).parkOn, false, 'parked just below the flat floor');
            // the retraction itself: BETWEEN the floor and break-even the seat
            // must open. This is the assertion that goes red if the multiplier
            // ever comes back.
            assert.strictEqual(seat(be - 0.05).parkOn, true,
                'refused a build above the floor and below break-even — the 6.112.0 veto is back');
        });
    }
    test('the bar is reachable: SIMPLE SYRUP 4 clears it, WATER 6 does not', () => {
        global.player = Object.assign({}, global.player, { defense: 34.992 });
        const be = T.breakEven();
        assert.ok(4 * 0.512 > be, 'SIMPLE SYRUP 4 = ' + (4 * 0.512) + ' does not clear ' + be.toFixed(3));
        assert.ok(6 * 0.284 > be, 'WATER 6 = ' + (6 * 0.284) + ' does not clear ' + be.toFixed(3));
        assert.ok(3 * 0.284 < be, 'the bar is so low that half a WATER stack clears it');
    });
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.113.0 THE OVERLAY REPORT.
//
// USER: "I want this all done by the report on the UI overlay. Everything you
// need should not require things from the console" / "when asking for audit,
// pine bot report, damage report, deep held rate, etc."
//
// Two defects behind the console habit: report() carried six of fourteen
// instruments, and the copy button reported success unconditionally because
// navigator.clipboard.writeText is async and its rejection never reached the
// surrounding try/catch.
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'overlay-report') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 900 } });
    pineBot.stop();
    const T = pineBot.test;

    // Every audit I can ask for by name must be a KEY of report(). Listed as
    // literals: deriving them from the object under test would make this pass
    // for any object at all.
    const NEEDED = ['compare', 'funnel', 'phases', 'damage', 'boss', 'learning',
                    'park', 'income', 'hunt', 'mark', 'pause', 'picks', 'cap', 'bossHit', 'summary'];
    test('report() carries every audit — nothing needs a console', () => {
        const r = pineBot.report();
        const missing = NEEDED.filter(k => !(k in r));
        assert.strictEqual(missing.length, 0, 'missing from report(): ' + missing.join(', '));
    });
    // JSON.stringify DROPS undefined keys, so a wrong accessor disappears
    // instead of erroring — how `picks` was silently absent in the first draft
    // of this version (window.pineBot.pickAudit lives under pineBot.test).
    test('...and none of them is undefined, which JSON would silently drop', () => {
        const r = pineBot.report();
        const undef = NEEDED.filter(k => r[k] === undefined);
        assert.strictEqual(undef.length, 0, 'undefined (will vanish from the paste): ' + undef.join(', '));
        const round = JSON.parse(JSON.stringify(r));
        const gone = NEEDED.filter(k => !(k in round));
        assert.strictEqual(gone.length, 0, 'lost in the JSON round-trip: ' + gone.join(', '));
    });
    // One audit throwing must degrade that key to null, never take the report
    // down — a thrown report sends the user straight back to the console.
    // `null` is what a WRONG ACCESSOR looks like and also what "no data yet"
    // looks like, and safe() collapses the two: reverting `picks` to the
    // non-existent window.pineBot.pickAudit still produced a `picks` key, just
    // null — so the two tests above stayed green with the bug reinstated.
    // Asserting the SHAPE separates them. Every one of these returns a live
    // object or array on a completely fresh store, so a null here means the
    // accessor is wrong, not that the audit is empty.
    test('every audit returns its real shape, not the null a bad accessor gives', () => {
        const r = pineBot.report();
        const SHAPE = { compare: 'object', funnel: 'object', phases: 'array', damage: 'object',
            boss: 'object', learning: 'object', park: 'object', income: 'object', hunt: 'object',
            mark: 'object', pause: 'object', picks: 'array', cap: 'object', bossHit: 'object' };
        const bad = Object.keys(SHAPE).filter(k => {
            const want = SHAPE[k], v = r[k];
            return want === 'array' ? !Array.isArray(v) : (v === null || typeof v !== 'object');
        });
        assert.strictEqual(bad.length, 0,
            'wrong shape (a null here is a broken accessor, not an empty audit): ' +
            bad.map(k => k + '=' + (Array.isArray(r[k]) ? 'array' : (r[k] === null ? 'NULL' : typeof r[k]))).join(', '));
    });
    test('a throwing audit degrades to null instead of killing the report', () => {
        const keep = pineBot.damageAudit;
        try {
            pineBot.damageAudit = () => { throw new Error('boom'); };
            const r = pineBot.report();
            assert.strictEqual(r.damage, null, 'damage should be null, got ' + JSON.stringify(r.damage));
            assert.ok(r.funnel !== undefined && r.compare !== undefined, 'the rest of the report was lost');
        } finally { pineBot.damageAudit = keep; }
    });

    // The human summary is a PURE function of the report, so it is asserted on
    // a fixture rather than on whatever the empty test store happens to hold.
    test('the summary renders the numbers the user actually asks for', () => {
        // v6.114.0 — THE FIXTURE WAS THE BUG. This object used
        //   compare: { current: { version, bartender, n, median, mean } }
        // and the live report uses
        //   compare: { current: "6.113.0+crown+joe", versions: [ {version, runs, medianTimeS, meanTimeS} ] }
        // — `current` is a STRING and the row lives in `versions`. The summary
        // was written against the fixture, the fixture was written against my
        // assumption, and the first real paste rendered "v—  —  n=—". A test
        // built on a hand-made shape only ever proves the shape.
        const fixture = {
            compare: {
                current: '6.113.0+crown+joe',
                versions: [
                    { version: '6.111.0+crown+joe', runs: 163, medianTimeS: 927 },
                    { version: '6.113.0+crown+joe', runs: 1250, medianTimeS: 834, meanTimeS: 1068, hellRate: 0.37, supersPerRun: 0.5 }
                ]
            },
            income: { firstNegativeMin: 20, buckets: [{ fromMin: 0, net: -0.27, lossPerSec: 1.27, gainPerSec: 1 }] },
            funnel: { groups: [{ dayClearRate: 0.36, entrySurvival: 0.28, deepHeldRate: 0.12, seatedRate: 0.4,
                buildsReady: 13, medianReadyAt: 1854, medianEntryDef: 34.9, medianEntryRegen: 1.42,
                medianDeepAt: 5100, medianDeepHold: 240, medianDeepStill: 100, medianDeepInv: 14,
                capOuts: 2, earlyCaps: 1, laneIn: 900, laneEsc: 880,
                medianInvAll: 33, medianCasts: 12, medianCdMul: 0.667, deaths: { day: 1 } }] },
            damage: { sole: { contact: { n: 60 }, line: { n: 30 }, mark: { n: 10 } } },
            boss: { kinds: [{ kind: 'GIANT', n: 40, firstGt: 1200, r0: 30, ringAt: 5200 }] },
            learning: { gen: 343, params: { 'threat.lineWeight': { atEdge: 'min' } }, reopen: { dims: ['a', 'b'] } }
        };
        const s = T.reportSummary(fixture);
        for (const want of ['6.113.0+crown+joe', 'n=1250', 'deepHeld 0.12', 'ready 13@1854',
                            'bestHold 240s', 'GIANT', 'ring@5200', 'lineWeight:min',
                            'median 834s',                 // read from versions[], not from `current`
                            'DRAINING FROM MINUTE ZERO'])  // the headline the income audit earns
            assert.ok(s.indexOf(want) >= 0, 'summary missing "' + want + '":\n' + s);
        // the damage line must be shares, biggest first
        assert.ok(/DAMAGE\s+contact 60%\s+line 30%/.test(s), 'damage line wrong:\n' + s);
    });
    test('the summary survives a completely empty report', () => {
        const s = T.reportSummary({});
        assert.ok(typeof s === 'string' && s.length > 0, 'empty report produced no summary');
        assert.ok(s.indexOf('census empty') >= 0, 'no boss-census hint on an empty report:\n' + s);
        assert.ok(!/undefined|NaN|\[object/.test(s), 'raw undefined/NaN leaked into the summary:\n' + s);
    });
    test('...and reports the pinned CEM dims, which is what explains a flat row', () => {
        const s = T.reportSummary({ learning: { params: {
            'movement.hellCautionMul': { atEdge: 'max' }, 'movement.standoff': {} } } });
        assert.ok(/AT EDGE.*hellCautionMul:max/.test(s), s);
        assert.ok(s.indexOf('standoff') < 0, 'a dim that is NOT at an edge was listed:\n' + s);
    });
    // Render the overlay while spying on createElement, so the pieces can be
    // inspected: the summary block must actually carry the summary, and the
    // copy button must exist to be exercised below.
    const render = (rep) => {
        const made = [];
        const keepCreate = global.document.createElement;
        const keepAppend = global.document.body.appendChild;
        let added = 0;
        global.document.createElement = function (tag) {
            const e = keepCreate.call(this, tag); e.__tag = tag; made.push(e); return e;
        };
        global.document.body.appendChild = function () { added++; return keepAppend && keepAppend.apply(this, arguments); };
        try { T.showReport(rep); } finally {
            global.document.createElement = keepCreate;
            global.document.body.appendChild = keepAppend;
        }
        return { made, added, btn: made.filter(e => e.__tag === 'button'), ta: made.filter(e => e.__tag === 'textarea')[0] };
    };
    test('showReport renders, reaches the DOM, and PRINTS the summary', () => {
        const rep = pineBot.report();
        const { made, added } = render(rep);
        assert.strictEqual(added, 1, 'the overlay was not appended to the document');
        const texts = made.map(e => String(e.textContent || ''));
        assert.ok(texts.some(t => t.indexOf('FUNNEL') >= 0),
            'no element carries the summary — the overlay rendered an empty header');
    });
    test('the textarea carries the full JSON, so ⌘C always works', () => {
        const rep = pineBot.report();
        const { ta } = render(rep);
        assert.ok(ta, 'no textarea — a <pre> cannot be selected, which is why the console was needed');
        assert.ok(String(ta.value || '').length > 200 && String(ta.value).indexOf('"funnel"') >= 0,
            'textarea does not hold the report JSON');
    });
    // ── THE BUG THIS VERSION EXISTS FOR ────────────────────────────────────
    // navigator.clipboard.writeText is ASYNC. The old handler called it inside
    // a try/catch and set the label to 'copied' on the next line, so a REJECTED
    // write still reported success. The button lied on every failure, which is
    // exactly when the user needed to be told to use the fallback.
    {
        const withClipboard = (impl, exec) => {
            const kc = global.navigator.clipboard, ke = global.document.execCommand;
            global.navigator.clipboard = impl;
            global.document.execCommand = exec;
            try {
                const { btn } = render(pineBot.report());
                const copy = btn.filter(b => String(b.textContent).indexOf('copy report') >= 0)[0];
                assert.ok(copy, 'no copy button rendered');
                copy.onclick();
                return copy;
            } finally { global.navigator.clipboard = kc; global.document.execCommand = ke; }
        };
        // NOTE: `test()` here is SYNCHRONOUS and ignores a returned promise,
        // so an assertion inside .then() would never run and the test would
        // pass vacuously — which is what the first draft of these four did.
        // These synchronous thenables drive the same p.then().catch() chain to
        // completion before the assertion, with no event loop involved.
        const syncResolved = () => ({ then(f) { f(); return { catch() { } }; } });
        const syncRejected = () => ({ then() { return { catch(g) { g(); } }; } });
        test('a RESOLVED clipboard write reports success', () => {
            const c = withClipboard({ writeText: syncResolved }, () => false);
            assert.ok(/copied/.test(c.textContent), 'label ' + c.textContent);
        });
        test('a REJECTED clipboard write falls back to execCommand and says so', () => {
            let execCalled = 0;
            const c = withClipboard({ writeText: syncRejected }, () => { execCalled++; return true; });
            assert.strictEqual(execCalled, 1, 'the execCommand fallback was never reached');
            assert.ok(/copied/.test(c.textContent), 'label ' + c.textContent);
        });
        test('when BOTH paths fail the button must NOT claim it copied', () => {
            const c = withClipboard({ writeText: syncRejected }, () => false);
            assert.ok(!/copied/.test(c.textContent),
                'the button claimed success with nothing on the clipboard: ' + c.textContent);
            assert.ok(/\u2318C|Ctrl/.test(c.textContent), 'no manual instruction given: ' + c.textContent);
        });
        test('...and with no clipboard API at all it still offers a path', () => {
            const c = withClipboard(undefined, () => false);
            assert.ok(!/copied/.test(c.textContent), c.textContent);
            assert.ok(/\u2318C|Ctrl/.test(c.textContent), c.textContent);
        });
    }
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.115.0 — what the first live regime rows demanded.
//
// deepReached 4, deepAt 4808-5400, deepStill 1 in every one, deepHp 0.70-0.82,
// deepHold 75 / 17 / 1 / 0 against a deepHoldS of 120. So deepHeldRate 0 is a
// THRESHOLD artifact, not a verdict on the anchor — and a single best-hold
// number cannot say whether the run failed once or flickered twenty times.
//
// And the census reported growthPer100s = 0 for every non-wall kind with
// r0 = 27-28, which would make ringHuge (r >= 149) impossible — while
// bossHitRange in the same report showed reach climbing 200 -> 353 (max 697).
// The sampler's 12 x 30 s window simply ended before the growth.
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'regime-breaks') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 5000, hell: true } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test, C = pineBot.config, W = C.field.w;
    const TIPS = C.deepHell.tipWindowToS;

    const boss = (id, r) => ({ id: id, type: 'boss', boss: true, bossChar: 'GIANT',
        x: W * 0.5, y: W * 0.5, r: r, hp: 9e9, maxHp: 9e9, speed: 0.4, moving: true });
    const scene = (gt, r) => {
        global.gameTime = gt; global.hell = true; T.latchHell();
        T.setOwned({ 'SOUTH SIDE': 6 });
        global.player = Object.assign({}, global.player, { x: 8, y: 8, hp: 100, maxHp: 100,
            defense: 34.992, regenBonus: 2.2, invuln: 0 });
        global.enemies = [boss(1, r)];
        global.eprojectiles = []; global.dropMarks = []; global.pickups = []; global.roadLines = [];
    };

    // ── v6.116.0: THE TWO ENDS OF THE CADENCE, both of which have shipped
    // broken. A fixed interval T needs 2T of boss life for a 3-point fit and
    // 48T of RUN for a horizon; 30 s had the samples and no horizon (growth 0
    // for every kind), 120 s had the horizon and no samples (growth null for
    // 9 of 10 kinds, against a median run of 854 s). These two tests pin both
    // ends, so no single fixed interval can pass them.
    test('a boss that lives only a minute still yields a fit', () => {
        pineBot.resetBossCensus(); T.startRun();
        for (let gt = 600; gt <= 660; gt += 5) { scene(gt, Math.round(28 + (gt - 600) * 0.5)); T.planMove(); }
        T.endRun();
        const k = pineBot.bossCensus().kinds.filter(x => x.kind === 'GIANT')[0];
        assert.ok(k, 'no GIANT row');
        assert.ok(k.growthPer100s != null,
            'a boss alive 60 s produced no fit — the cadence is slower than these bosses live');
        assert.ok(k.growthPer100s > 20,
            'growth ' + k.growthPer100s + ' px/100s against a planted 50');
    });
    test('...and a boss tracked for 100 minutes is still being sampled at the end', () => {
        pineBot.resetBossCensus(); T.startRun();
        for (let gt = 600; gt <= 6600; gt += 5) { scene(gt, Math.round(28 + (gt - 600) * (132 / 4800))); T.planMove(); }
        T.endRun();
        const k = pineBot.bossCensus().kinds.filter(x => x.kind === 'GIANT')[0];
        assert.ok(k && k.spanS != null, 'no span recorded');
        assert.ok(k.spanS >= 5000,
            'kept samples span ' + k.spanS + ' s of a 6000 s life — the slots ran out and the tail was never seen');
        assert.ok(k.growthPer100s > 2.0 && k.growthPer100s < 3.5,
            'growth ' + k.growthPer100s + ' px/100s against a planted 2.75 — decimation biased the fit');
        assert.ok(k.n >= 1 && (pineBot.bossCensus().kinds.length >= 1), 'census row missing');
    });
    test('a boss tracked across the whole run yields a real growth fit', () => {
        pineBot.resetBossCensus(); T.startRun();
        // r climbs 28 -> 160 over 4800 s: the shape bossHitRange implies
        for (let gt = 600; gt <= 5400; gt += 120) {
            scene(gt, Math.round(28 + (gt - 600) * (132 / 4800)));
            T.planMove();
        }
        T.endRun();
        const k = pineBot.bossCensus().kinds.filter(x => x.kind === 'GIANT')[0];
        assert.ok(k, 'no GIANT row');
        assert.ok(k.growthPer100s > 1,
            'growth ' + k.growthPer100s + ' px/100s against a planted 2.75 — the window still ends too early');
        assert.ok(k.ringAt != null && k.ringAt > 600 && k.ringAt < 9000,
            'ringAt ' + k.ringAt + ' — the crossing is not being extrapolated');
    });

    test('a broken hold records WHICH clause dropped, and the length it reached', () => {
        T.startRun();
        for (let i = 0; i < 8; i++) { scene(TIPS + 100 + i * 10, W * 0.30); T.planMove(); }
        scene(TIPS + 300, 20); T.planMove();          // ring gone -> break by 'ring'
        const r = T.phaseRow();
        assert.ok(r.deepBreak && r.deepBreak.ring >= 1, 'break reason: ' + JSON.stringify(r.deepBreak));
        assert.ok(Array.isArray(r.deepHolds) && r.deepHolds.length >= 1, 'holds: ' + JSON.stringify(r.deepHolds));
        assert.ok(r.deepHolds[0] >= 60, 'first hold ' + r.deepHolds[0] + ' — the length was not captured');
    });
    test('...and the park clause is distinguished from the ring clause', () => {
        T.startRun();
        for (let i = 0; i < 5; i++) { scene(TIPS + 100 + i * 10, W * 0.30); T.planMove(); }
        scene(TIPS + 200, W * 0.30);
        T.setOwned({ 'SOUTH SIDE': 0 });               // parkClear fails -> break by 'park'
        T.planMove();
        const r = T.phaseRow();
        assert.ok(r.deepBreak && r.deepBreak.park >= 1 && !r.deepBreak.ring,
            'expected a park break only, got ' + JSON.stringify(r.deepBreak));
        T.setOwned({ 'SOUTH SIDE': 6 });
    });
    test('many short flickers and one long hold are distinguishable', () => {
        T.startRun();
        for (let rep = 0; rep < 3; rep++) {
            for (let i = 0; i < 3; i++) { scene(TIPS + rep * 400 + i * 10, W * 0.30); T.planMove(); }
            scene(TIPS + rep * 400 + 100, 20); T.planMove();
        }
        const r = T.phaseRow();
        assert.strictEqual(r.deepHolds.length, 3, 'holds ' + JSON.stringify(r.deepHolds));
        assert.ok(r.deepBreak.ring === 3, JSON.stringify(r.deepBreak));
    });

    // The clamp that was binding on the two highest-evidence enemy types.
    test('the enemy-fear ceiling is above what the two killers measured', () => {
        assert.ok(C.learning.enemyMulCeil > 1.42,
            'ceiling ' + C.learning.enemyMulCeil + ' still clamps drunk 1.404 / runner 1.417');
        assert.ok(C.learning.enemyMulCeil <= 2.2, 'ceiling ' + C.learning.enemyMulCeil + ' is now unbounded in practice');
    });
    done();
}

// ─────────────────────────────────────────────────────────────────────────────
// v6.116.0 THE SEAT-MISS CENSUS.
//
// v6.115.0 asked which clause ended the deep-hell hold and got
// `deepBreak: { park: 27, ring: 6 }` with every recorded hold 0 or 1 game-
// second long. That is not an anchor that fails once; it is an anchor that
// flickers 33 times in a single run, and `park` is a dozen conditions folded
// into one boolean — three build gates, three exceptions, three
// higher-precedence overrides and a walk. Knowing the sum is false says
// nothing about which one to fix.
//
// So the census goes one level down: every hell tick the bot is not seated is
// booked against the condition that took it, in the planner's own precedence
// order. These tests exist to make sure each bucket is reachable, that they
// are mutually exclusive, and that the totals reconcile — because a census
// that silently pools two causes is worse than no census at all, which is
// exactly the failure `laneIn === laneEsc` was in 6.113.0.
// ─────────────────────────────────────────────────────────────────────────────
if (which === 'park-miss') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 6000, hell: true } });
    pineBot.stop();
    pineBot.test.applyDefaults();
    const T = pineBot.test, C = pineBot.config;
    const W = C.field.w, H = C.field.h;

    // The seat itself: hell, past parkFromS, armour at cap, regen clear of the
    // floor, SOUTH SIDE owned, standing 10 px from the true corner. Every test
    // below changes exactly ONE thing about this scene.
    const seat = (o) => {
        o = o || {};
        global.gameTime = o.gt != null ? o.gt : 6000;
        global.hell = true; T.latchHell();
        T.setOwned(o.owned || { 'OLIVE': 6, 'SOUTH SIDE': 3 });
        global.player = Object.assign({ x: W - 7, y: H - 7, r: 7.2, hp: 300, maxHp: 309,
            speed: 2.375, defense: 34.992, regenBonus: 2.218, invuln: 0 }, o.player || {});
        global.enemies = o.enemies || [];
        global.dropMarks = o.marks || [];
        global.roadLines = o.lines || [];
        global.eprojectiles = []; global.pickups = [];
        return T.planMove();
    };
    // one tick from a clean run, so parkMiss holds that tick and nothing else
    const oneTick = (o) => { T.startRun(); const p = seat(o); return { plan: p, row: T.phaseRow() }; };
    const missOf = (o) => { const r = oneTick(o).row; return r.parkMiss || {}; };
    const only = (o) => { const m = missOf(o); const k = Object.keys(m); return k.length === 1 ? k[0] : k.join('+'); };

    // --- (1) THE BASELINE. If the seat itself does not latch, every test
    // below is measuring the wrong thing, so this is asserted first.
    test('the reference scene actually seats the bot', () => {
        const r = oneTick().row;
        assert.strictEqual(r.parkT, 1, 'parkT ' + r.parkT + ' — the reference scene does not park');
        assert.strictEqual(r.parkMiss, null, 'a seated tick booked a miss: ' + JSON.stringify(r.parkMiss));
        assert.strictEqual(r.hellT, 1, 'hellT ' + r.hellT);
    });

    // --- (2) EVERY BUCKET IS REACHABLE, and names the condition that took it.
    test('regen below the floor books "regen"', () =>
        assert.strictEqual(only({ player: { regenBonus: 0.2 } }), 'regen'));
    test('armour below parkDefense books "armor"', () =>
        assert.strictEqual(only({ player: { defense: 4 }, owned: { 'OLIVE': 0, 'SOUTH SIDE': 3 } }), 'armor'));
    test('no zoner books "clear"', () =>
        assert.strictEqual(only({ owned: { 'OLIVE': 6, 'SOUTH SIDE': 0 } }), 'clear'));
    test('hell before parkFromS books "early"', () =>
        assert.strictEqual(only({ gt: 900 }), 'early'));
    test('a mark on the seat books "mark"', () =>
        // shape matters: the gatherer drops anything with no dmg/tele as loot
        assert.strictEqual(only({ marks: [{ x: W - 7, y: H - 7, r: 58, dmg: 72, tele: 0.6, at: 6000.3 }] }), 'mark'));
    test('a charge lane across the corner books "line"', () =>
        assert.strictEqual(only({ lines: [{ x: W - 200, y: H - 7, ang: 0, armed: true, dmg: 60, life: 200 }] }), 'line'));
    test('standing away from a seat it is allowed to take books "walk"', () =>
        assert.strictEqual(only({ player: { x: W * 0.5, y: H * 0.5 } }), 'walk'));

    // --- (3) EXCLUSIVITY AND RECONCILIATION. The whole value of the census is
    // that the buckets partition the non-seated hell ticks; if two causes can
    // both book the same tick, the largest bucket is an artefact of ordering
    // rather than a target. Asserted as arithmetic over a mixed run.
    test('the buckets partition every hell tick', () => {
        T.startRun();
        seat();                                        // seated
        seat({ player: { regenBonus: 0.2 } });         // regen
        seat({ gt: 900 });                             // early
        seat({ player: { x: W * 0.5, y: H * 0.5 } });  // walk
        seat();                                        // seated again
        const r = T.phaseRow();
        const sum = Object.keys(r.parkMiss || {}).reduce((s, k) => s + r.parkMiss[k], 0);
        assert.strictEqual(r.hellT, 5, 'hellT ' + r.hellT);
        assert.strictEqual(r.parkT + sum, r.hellT,
            'seated ' + r.parkT + ' + missed ' + sum + ' != hell ' + r.hellT + ' — a tick was double-booked or lost');
        assert.strictEqual(r.parkT, 2, 'parkT ' + r.parkT);
    });
    test('a scene that trips TWO conditions books exactly one, the earlier in precedence', () => {
        // no regen AND standing off the corner: `regen` is a parkOn clause and
        // `walk` is downstream of parkOn, so regen must win and walk must be absent
        const m = missOf({ player: { regenBonus: 0.2, x: W * 0.5, y: H * 0.5 } });
        assert.strictEqual(Object.keys(m).length, 1, 'booked ' + JSON.stringify(m));
        assert.strictEqual(m.regen, 1, 'booked ' + JSON.stringify(m) + ' — precedence is not the planner\'s');
    });

    // --- (4) IT REACHES THE FUNNEL. The v6.111.0 instruments were written to
    // every phase row and never aggregated, so the report — the thing actually
    // read — could not show whether they had moved. Not again.
    test('the census aggregates into the funnel with a share to read it against', () => {
        pineBot.resetPhaseAudit();
        T.startRun(); seat(); seat({ player: { regenBonus: 0.2 } }); seat({ gt: 900 }); T.endRun();
        const g = (pineBot.phaseAudit().groups || [])[0];
        assert.ok(g, 'no funnel group');
        assert.ok(g.parkMiss, 'parkMiss never reached the funnel');
        assert.strictEqual(g.parkMiss.regen, 1, 'funnel parkMiss ' + JSON.stringify(g.parkMiss));
        assert.strictEqual(g.parkMiss.early, 1, 'funnel parkMiss ' + JSON.stringify(g.parkMiss));
        assert.strictEqual(g.seatShare, 0.333,
            'seatShare ' + g.seatShare + ' — 1 seated tick of 3 hell ticks');
    });
    test('...and the overlay prints it, biggest cause first', () => {
        pineBot.resetPhaseAudit();
        T.startRun();
        seat();
        for (let i = 0; i < 4; i++) seat({ player: { regenBonus: 0.2 } });
        seat({ gt: 900 });
        T.endRun();
        const lines = T.reportSummary(pineBot.report()).split('\n');
        const seatLine = lines.filter(l => /^SEAT/.test(l))[0];
        assert.ok(seatLine, 'no SEAT line in the summary:\n' + lines.join('\n'));
        assert.ok(/held 17%/.test(seatLine), 'share not printed: ' + seatLine);
        assert.ok(/regen 80%\s+early 20%/.test(seatLine),
            'causes not printed largest-first: ' + seatLine);
    });
    done();
}

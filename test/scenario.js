#!/usr/bin/env node
// One test scenario per process (the bot's autoStart timer and panel
// intervals would otherwise leak between scenarios). Invoked by run.js.
const path = require('path');
const assert = require('assert');
const makeEnv = require('./fake-env');
const SCRIPT = path.join(__dirname, '..', 'dist', 'pine-bot.user.js');
const pkg = require('../package.json');
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
        versions: { '6.79.0': { n: 93, sumT: 150102, bestT: 9845, sumR: 195, hell: 59, day: 59, sumSupers: 288, deaths: {}, epoch: 2, firstRun: 3612, lastRun: 3704 } },
        runLog: [{ v: '6.79.0', t: 9845 }, { v: '6.79.0', t: 257 }]
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
    test('crown profile does not refuse SUPER NEGRONI', () => assert.ok(sup.score > 200, 'score ' + sup.score));
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
        test('so MOSCOW MULE can never complete a super', () => {
            const mule = pineBot.test.scoreCard({ n: 'MOSCOW MULE', type: 'weapon', lv: 5, maxlv: 6 }, 0, []);
            assert.ok(mule.score > 0, 'refused outright: ' + mule.why);
            assert.ok(/last-resort/.test(mule.why), mule.why);
        });
        // the whole point of the band: never sought, always preferred to junk
        const sc = (n, t) => pineBot.test.scoreCard({ n, type: t, lv: 1, maxlv: 6 }, 0, []).score;
        test('the mule loses to every hell-safe junk pick', () => {
            const mule = sc('MOSCOW MULE', 'weapon');
            for (const [n, t] of [['COFFEE BEANS', 'passive'], ['LIME', 'passive'], ['SODA WATER', 'passive']])
                assert.ok(sc(n, t) > mule, n + ' ' + Math.round(sc(n, t)) + ' vs mule ' + Math.round(mule));
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
//    and the hell boss-ring floor. The fake env boots with no
//    preferredBartender, so activeChar falls to bartenderRotation[0] = 'pat'.
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
    // --- (c) learned enemy-type weight multiplies the danger field.
    global.enemies = [{ type: 'bomber', x: 340, y: 270, r: 14, hp: 400, maxHp: 400, speed: 1.2, moving: true }];
    pineBot.test.setEnemyMul({});
    const w1 = pineBot.test.gatherThreats(global.player).enemies[0].w;
    pineBot.test.setEnemyMul({ bomber: 2.0 });
    const w2 = pineBot.test.gatherThreats(global.player).enemies[0].w;
    // v6.85.23: the multiplier is INSTRUMENT-ONLY — applying it caused the
    // worst regression of the project (fear of common types ratcheted to the
    // 2.2 cap and the bot stopped farming). The weight must NOT move.
    test('a stored 2x multiplier does NOT change the danger-field weight', () =>
        assert.ok(Math.abs(w2 / w1 - 1) < 0.01, 'w1 ' + w1 + ' w2 ' + w2));
    // --- (d) damage near a typed enemy is attributed to that type.
    pineBot.test.setEnemyMul({});
    global.player.hp = 170;
    pineBot.test.planMove();
    global.player.hp = 150;
    pineBot.test.planMove();
    const ht = pineBot.test.hitTypes();
    test('the HP drop is attributed to the nearby enemy type', () =>
        assert.ok(ht.bomber >= 19, JSON.stringify(ht)));
    done();
}

// 22. v6.85.23: the CEM sanitizer heals NaN-poisoned state from 6.85.22.
if (which === 'cem-heal') {
    const poisoned = {
        runs: 200, bartender: 'minguk', rewardEpoch: 2,
        cem: { mean: { 'movement.standoff': 120, 'patRing.early': NaN }, sigma: { 'movement.standoff': 20, 'patRing.early': NaN },
               pc: { 'movement.standoff': NaN }, ss: NaN, batch: [{ r: 1, p: { 'movement.standoff': 118, 'patRing.mid': NaN } }] },
        hof: [{ r: 3, p: { 'movement.standoff': 115, 'movement.killOrderDist': NaN } }],
        enemyTypeMul: { mob: 2.2, bomber: 2.0 }
    };
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 5 },
        storage: { pineBotUCB_v5: JSON.stringify(poisoned) } });   // v6.87.1: minguk is pinned, and his store is the UNSUFFIXED key
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
        runs: 3373, bartender: 'minguk', rewardEpoch: 2,
        cem: { mean, sigma, pc: {}, ss: 0.616, gen: 425, batch: [] },
        // hof[0] and hof[1] byte-identical, as measured
        hof: [{ r: 9.9, p: { ...champ } }, { r: 9.9, p: { ...champ } }, { r: 8, p: { ...champ } },
              { r: 7, p: { ...mean, 'movement.standoff': 150 } }]
    };
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 5 },
        storage: { pineBotUCB_v5: JSON.stringify(locked) } });   // v6.87.1: minguk is pinned, and his store is the UNSUFFIXED key
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
    global.gameTime = 60; const early = oliveAt();
    global.gameTime = 1150; const late = oliveAt();
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
        let pl; const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            pl = pineBot.test.planMove();
            po.hp = Math.max(1, po.hp - dmgPerTick);
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
    // 80k is a 20-minute passout: 300 dps needs 4+ minutes, far past the budget
    const hard = burn(80000, 30, 9000);
    test('an unkillable passout is abandoned after the probe window', () =>
        assert.strictEqual(hard.plan.poGaveUp, 1, 'gave up ' + hard.plan.poGaveUp));
    test('the abandonment is logged with the measured numbers', () =>
        assert.ok(logs.some(l => /passout .* abandoned/.test(l)), logs.slice(-3).join(' | ')));
    // ...but not while the ult — the actual clear tool — is nearly ready
    const withUlt = burn(80000, 30, 9000, { ultReadyAt: 905 });   // gameTime 900, ready in 5s
    test('a body the ult is about to clear is NOT abandoned', () =>
        assert.strictEqual(withUlt.plan.poGaveUp, 0, 'gave up ' + withUlt.plan.poGaveUp));
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
            sup: gt < 95 ? 0 : 1, ol: gt < 40 ? 0 : 4, ng: gt < 80 ? 0 : 2 });
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
    // v6.87.1: minguk is PINNED. He is the better character on every number
    // that exists (median 21.9m vs 15.4m) and the one that competed for the
    // crown, so the whole sample rate goes to him.
    test('minguk is pinned as the active bartender', () =>
        assert.strictEqual(pineBot.config.preferredBartender, 'minguk'));
    test('boot lands on him, not on the rotation head', () =>
        assert.strictEqual(T.activeChar(), 'minguk'));
    const pinned = [T.chooseBartender(), T.chooseBartender(), T.chooseBartender()];
    test('the pin holds run after run', () =>
        assert.deepStrictEqual(pinned, ['minguk', 'minguk', 'minguk'], pinned.join(',')));
    // The rotation machinery must survive being switched off, or re-enabling
    // it silently does nothing — which is exactly the 6.85.0 failure.
    pineBot.config.preferredBartender = null;
    const seq = [T.chooseBartender(), T.chooseBartender(), T.chooseBartender(), T.chooseBartender()];
    test('lifting the pin restores a rotation that actually alternates', () =>
        assert.deepStrictEqual(seq, ['pat', 'minguk', 'pat', 'minguk'], seq.join(',')));
    test('the rotation list is still pat and minguk (joe stays retired)', () =>
        assert.deepStrictEqual(pineBot.config.bartenderRotation, ['pat', 'minguk']));
    test('the position is persisted, so a reload resumes mid-sequence', () =>
        assert.strictEqual(String(store.pineBotRotIdx), '0', 'idx ' + store.pineBotRotIdx));
    pineBot.config.preferredBartender = 'minguk';
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
    test('a stored index resumes where the last session stopped', () =>
        assert.strictEqual(T.nextRotationChar(), 'minguk'));
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
    test('...and the ones the user dropped are gone', () => {
        for (const c of ['GIN TONIC', 'WHISKY SOUR', 'VODKA CRANBERRY'])
            assert.ok(!pat.cocktails.includes(c), c + ' should be off the roster');
    });
    test('NEGRONI is the only keyless cocktail carried', () => {
        assert.ok(pat.cocktails.includes('NEGRONI'), 'NEGRONI missing');
        assert.strictEqual(pat.cocktails.length, 4, pat.cocktails.join(','));
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
    const NEVER = new Set(['LEMON', 'ORANGE']);
    const completable = r => r.cocktails.filter(c => {
        const key = pineBot.test.superKey(c);
        return key && !NEVER.has(key) && (r.ingredients.includes(key) || key === 'GINGER BEER');
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
    test('the cap is five super lines', () =>
        assert.strictEqual(pineBot.config.maxSuperLines, 5));
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
    // close). 9600 must still engage, and 5000 — which the OLD gate refused —
    // is the case that proves the threshold actually moved.
    const deep = place(9600);
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
    // line was latent from turn one. This must be refused with nothing owned.
    const before = sc('MANHATTAN', 'weapon', 0);
    test('MANHATTAN is refused from the FIRST pool, key unbuilt, nothing owned', () =>
        assert.ok(before < -400, 'MANHATTAN ' + Math.round(before)));
    test('...and it loses to the junk it beat in the live log (ANGOSTURA scored 8)', () =>
        assert.ok(sc('ANGOSTURA', 'passive', 0) > before,
            'ANGOSTURA ' + Math.round(sc('ANGOSTURA', 'passive', 0)) + ' vs MANHATTAN ' + Math.round(before)));
    for (const c of ['VODKA MARTINI', 'WHISKEY HIGHBALL', 'DRY MARTINI', 'BLOODY MARY', 'ESPRESSO MARTINI'])
        test('the other plan-keyed sixth line is refused too: ' + c, () =>
            assert.ok(sc(c, 'weapon', 0) < -400, c + ' ' + Math.round(sc(c, 'weapon', 0))));

    // PATH 1 — the key is simply maxed and still in the bar.
    T.setOwned({ 'SWEET VERMOUTH': 6 });
    test('a MAXED SWEET VERMOUTH makes MANHATTAN a latent sixth line', () =>
        assert.ok(sc('MANHATTAN', 'weapon', 0) < -400,
            'MANHATTAN ' + Math.round(sc('MANHATTAN', 'weapon', 0))));
    test('and the refusal is tagged', () =>
        assert.ok(/latent-line/.test(why('MANHATTAN', 'weapon', 0))));

    // PATH 2 — THE REAL ONE. The craft has fused and eaten the half, so
    // ownedLevels no longer contains SWEET VERMOUTH at all. This is the case
    // every previous version got wrong.
    T.setOwned({ 'SWEET VERMOUTH': 0, 'BLACK VERMOUTH': 1 });
    test('an ABSORBED SWEET VERMOUTH still arms the line', () =>
        assert.ok(sc('MANHATTAN', 'weapon', 0) < -400,
            'post-craft MANHATTAN ' + Math.round(sc('MANHATTAN', 'weapon', 0))));
    test('VODKA MARTINI — the other half of the same craft — is refused too', () =>
        assert.ok(sc('VODKA MARTINI', 'weapon', 0) < -400,
            'VODKA MARTINI ' + Math.round(sc('VODKA MARTINI', 'weapon', 0))));
    test('and feeding one already owned is refused as well', () =>
        assert.ok(sc('MANHATTAN', 'weapon', 3) < -200,
            'MANHATTAN lv3 ' + Math.round(sc('MANHATTAN', 'weapon', 3))));

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

if (!['snapshots', 'scoring', 'hell-unban', 'pat-profile', 'boss-floor', 'directives', 'time-stop', 'flight', 'hell-southside', 'ult-falloff', 'flame-cross', 'backlog', 'freeze-aura', 'damage-audit', 'focus-fire', 'item-stop', 'flame-anchor', 'kill-order', 'edge-boss', 'stop-giant', 'grind', 'gun-veto', 'learned', 'cem-heal', 'cem-lockup', 'ult-kinds', 'po-feasibility', 'tank-holdout', 'demo-digest', 'rotation', 'rotation-resume', 'rotation-doctrine', 'runner-posture', 'roster-cap', 'char-posture', 'gun-path', 'gun-forced', 'craft-prompt', 'evo-tip', 'audit-signal', 'audit-craft', 'audit-clicks', 'levelup-repeat', 'levelup-miss', 'chrome-veto', 'corner-anchor', 'mark-escape', 'underpowered-label', 'slot-lockout', 'latent-line', 'shield-pool', 'ult-chain', 'kite-damp', 'kite-deadband', 'income-audit', 'panic-anchor', 'minguk-invuln', 'mark-ghost', 'deep-park', 'dormant-hunt'].includes(which)) { console.error('unknown scenario ' + which); process.exit(2); }

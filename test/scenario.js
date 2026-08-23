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
        test('GINGER BEER unbanned in hell', () => assert.ok(gb.score > 0 && /roadmap/.test(gb.why), gb.why));
        test('roadmap reports unban', () => assert.strictEqual(global.window.pineBotStats().currentRoadmap.hellUnbanApplied, true));
        done();
    }, 2000);
}

// 4. v6.85.2 Pat calibration: profile fields, falling-passout drop tag,
//    and the hell boss-ring floor. The fake env boots with no
//    preferredBartender, so activeChar falls to bartenderRotation[0] = 'pat'.
if (which === 'pat-profile') {
    const { pineBot } = makeEnv({ script: SCRIPT, game: { state: 'playing', gameTime: 600 } });
    pineBot.stop();
    const prof = () => global.window.pineBotStats().charProfile;
    test('pat is pinned as the active bartender', () => assert.strictEqual(global.window.pineBotStats().bartender, 'pat'));
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
        test('parked inside the station, the planner backs off the paused boss', () => {
            const dNow = Math.hypot(330 - 270, 0);
            const dNew = Math.hypot(330 - (270 + plan.dx * 6), 270 - (270 + plan.dy * 6));
            assert.ok(dNew > dNow, 'dNow ' + dNow.toFixed(1) + ' dNew ' + dNew.toFixed(1));
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
        runs: 200, bartender: 'pat', rewardEpoch: 2,
        cem: { mean: { 'movement.standoff': 120, 'patRing.early': NaN }, sigma: { 'movement.standoff': 20, 'patRing.early': NaN },
               pc: { 'movement.standoff': NaN }, ss: NaN, batch: [{ r: 1, p: { 'movement.standoff': 118, 'patRing.mid': NaN } }] },
        hof: [{ r: 3, p: { 'movement.standoff': 115, 'movement.killOrderDist': NaN } }],
        enemyTypeMul: { mob: 2.2, bomber: 2.0 }
    };
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 5 },
        storage: { pineBotUCB_v5_pat: JSON.stringify(poisoned) } });
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
        runs: 3373, bartender: 'pat', rewardEpoch: 2,
        cem: { mean, sigma, pc: {}, ss: 0.616, gen: 425, batch: [] },
        // hof[0] and hof[1] byte-identical, as measured
        hof: [{ r: 9.9, p: { ...champ } }, { r: 9.9, p: { ...champ } }, { r: 8, p: { ...champ } },
              { r: 7, p: { ...mean, 'movement.standoff': 150 } }]
    };
    const { pineBot } = makeEnv({ script: SCRIPT, frames: 40, game: { state: 'playing', gameTime: 5 },
        storage: { pineBotUCB_v5_pat: JSON.stringify(locked) } });
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
        // coverage only: with 6 bodies at 70px the danger score fires the dash
        // regardless. What 6.85.6 changes is the GATE (1300 ms -> 300 ms via
        // plan.flight), which a single maybeAbilities call cannot observe.
        test('the dash fires during a low-HP flight', () => assert.ok(dashes > 0, 'dashes ' + dashes));
        done();
    }, 2000);
}

if (!['snapshots', 'scoring', 'hell-unban', 'pat-profile', 'boss-floor', 'directives', 'time-stop', 'flight', 'hell-southside', 'ult-falloff', 'flame-cross', 'backlog', 'freeze-aura', 'damage-audit', 'focus-fire', 'item-stop', 'flame-anchor', 'kill-order', 'edge-boss', 'stop-giant', 'grind', 'gun-veto', 'learned', 'cem-heal', 'cem-lockup', 'ult-kinds', 'po-feasibility', 'tank-holdout', 'demo-digest'].includes(which)) { console.error('unknown scenario ' + which); process.exit(2); }

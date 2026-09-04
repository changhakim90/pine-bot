// v6.126.0 — deterministic planner scenes shared by test/scenario.js
// (`plan-golden`) and tools/plan-diff.js. Same seed → same scenes, so a
// plan recorded from one build can be compared to another build's plan.
//
// The scenes deliberately cover the shapes that matter for the planner's
// cost and correctness: swarm (bodies pressing on the player, the deep-hell
// geometry) and uniform fields; day and hell; joe / pat / minguk; random
// projectiles, marks, lanes and loot; HP anywhere from a fifth to full.
'use strict';
function lcg(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

function makeScenes(seed, count) {
    const rnd = lcg(seed);
    const scenes = [];
    for (let s = 0; s < count; s++) {
        const swarm = s % 2 === 0, px = 40 + rnd() * 460, py = 40 + rnd() * 460, n = 20 + Math.floor(rnd() * 240);
        const en = [];
        for (let i = 0; i < n; i++) {
            let x, y;
            if (swarm) { const a = rnd() * Math.PI * 2, d = 10 + rnd() * rnd() * 320; x = px + Math.cos(a) * d; y = py + Math.sin(a) * d; }
            else { x = rnd() * 540; y = rnd() * 540; }
            const t = i < 8 ? 'passout' : (i < 11 ? 'boss' : ['drunk', 'runner', 'bomber', 'thrower', 'genz'][i % 5]);
            en.push({ id: i, type: t, x, y, r: t === 'passout' ? 37 : (t === 'boss' ? 40 + rnd() * 60 : 8 + rnd() * 8),
                hp: 400, maxHp: 400, speed: 0.8 + rnd() * 2, bossNo: t === 'boss' ? i - 7 : 0, moving: rnd() > 0.2, fallT: 0,
                frozenUntil: rnd() > 0.8 ? 300100 : 0 });
        }
        scenes.push({
            enemies: en, surgeUntil: rnd() > 0.7 ? 6000 : 0, finale: null, claseUlt: null, frame: 300000, killCount: Math.floor(rnd() * 5000),
            eprojectiles: Array.from({ length: Math.floor(rnd() * 25) }, () => ({ x: rnd() * 540, y: rnd() * 540, vx: (rnd() - .5) * 4, vy: (rnd() - .5) * 4, r: 6 })),
            dropMarks: Array.from({ length: Math.floor(rnd() * 6) }, () => ({ x: rnd() * 540, y: rnd() * 540, r: 50 + rnd() * 40, t: rnd() * 60 })),
            roadLines: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ x: rnd() * 540, y: rnd() * 540, ang: rnd() * 6.28, armed: rnd() > 0.5, dmg: 40 })),
            pickups: Array.from({ length: Math.floor(rnd() * 60) }, () => ({ x: rnd() * 540, y: rnd() * 540, type: ['gold', 'xp', 'tip', 'bottle'][Math.floor(rnd() * 4)] })),
            player: { x: px, y: py, hp: 100 + rnd() * 369, maxHp: 469, speed: 1.9, r: 7.2, defense: rnd() * 35, regenBonus: rnd() * 2,
                ultReadyAt: rnd() > 0.5 ? 1e9 : 100, shield: rnd() * 100, ultUntil: rnd() > 0.8 ? 5010 : 0 }
        });
    }
    return scenes;
}

// Runs every scene through a booted bot and returns one plan per tick as a
// JSON string. `makeEnv` is test/fake-env.js; `script` the dist to load.
function recordPlans(makeEnv, script, { hell, char, seed, scenes = 40, ticks = 6 }) {
    const { pineBot } = makeEnv({ script, game: { state: 'playing', gameTime: 5000, hell } });
    pineBot.stop();
    const T = pineBot.test;
    T.applyDefaults(); T.setChar(char);
    T.setOwned({ 'SOUTH SIDE': 6, 'OLIVE': 6, 'WATER': 4, 'GIN TONIC': 6, 'NEGRONI': 6 });
    const out = [];
    for (const sc of makeScenes(seed, scenes)) {
        Object.assign(global, sc);
        for (let k = 0; k < ticks; k++) { global.gameTime += 0.033; out.push(JSON.stringify(T.planMove())); }
    }
    return out;
}

// Numeric tolerance: hypot → sqrt(a²+b²) and folded coefficient products
// differ from the original at the ulp level, never more. Anything above
// 1e-9 relative is a different decision, not rounding.
function samePlan(a, b, tol = 1e-9) {
    const same = (x, y) => {
        if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));
        if (x && y && typeof x === 'object') {
            const kx = Object.keys(x), ky = Object.keys(y);
            return kx.length === ky.length && kx.every(k => same(x[k], y[k]));
        }
        return x === y;
    };
    try { return same(JSON.parse(a), JSON.parse(b)); } catch (e) { return a === b; }
}

const CASES = [];
for (const hell of [true, false]) for (const char of ['joe', 'pat', 'minguk']) for (const seed of [1, 2, 3]) CASES.push({ hell, char, seed });

// A compact digest for the committed golden file: the heading, the three
// score components, and every boolean flag that was set. ~100 bytes a plan
// instead of ~2.3 KB, and everything a changed decision would show up in.
function digestPlan(json) {
    let pl; try { pl = JSON.parse(json); } catch (e) { return json; }
    if (!pl || typeof pl !== 'object') return json;
    const num = v => (typeof v === 'number' && isFinite(v)) ? +v.toPrecision(10) : null;
    const flags = Object.keys(pl).filter(k => pl[k] === true).sort();
    return [num(pl.dx), num(pl.dy), num(pl.value), num(pl.danger), num(pl.gain), flags.join(',')];
}
function sameDigest(a, b, tol = 1e-9) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (typeof x === 'number' && typeof y === 'number') { if (Math.abs(x - y) > tol * Math.max(1, Math.abs(x), Math.abs(y))) return false; }
        else if (x !== y) return false;
    }
    return true;
}

module.exports = { makeScenes, recordPlans, samePlan, digestPlan, sameDigest, CASES };

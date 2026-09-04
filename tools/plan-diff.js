#!/usr/bin/env node
// v6.126.0 — THE EQUIVALENCE PROOF for performance work.
//
//   node tools/plan-diff.js <buildA.user.js> <buildB.user.js>
//
// Runs both builds through the same 18 deterministic scene families
// (test/plan-scenes.js: day/hell × joe/pat/minguk × 3 seeds, 40 scenes × 6
// ticks each = 4,320 plans) and reports every plan that differs by more
// than 1e-9. A performance change that claims "no play-logic change" must
// print `0 differ` here against the last build before it. To refresh the
// committed golden file after an INTENDED behaviour change:
//
//   node tools/plan-diff.js --golden dist/pine-bot.user.js
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const scenesMod = path.join(__dirname, '..', 'test', 'plan-scenes.js');
const { CASES, digestPlan } = require(scenesMod);
const runner = `
const makeEnv = require(${JSON.stringify(path.join(__dirname, '..', 'test', 'fake-env.js'))});
const { recordPlans } = require(${JSON.stringify(scenesMod)});
const [script, hell, char, seed, outFile] = process.argv.slice(2);
require('fs').writeFileSync(outFile, recordPlans(makeEnv, script, { hell: hell === 'hell', char, seed: +seed }).join('\\n'));
process.exit(0);
`;
const runnerPath = path.join(require('os').tmpdir(), 'pine-plan-runner.js');
fs.writeFileSync(runnerPath, runner);
function record(script, c) {
    const f = path.join(require('os').tmpdir(), `pine-plans-${process.pid}.txt`);
    const r = spawnSync(process.execPath, [runnerPath, script, c.hell ? 'hell' : 'day', c.char, c.seed, f], { timeout: 120000 });
    if (r.status !== 0) { console.error('runner failed for', script, c, r.stderr.toString().slice(-500)); process.exit(2); }
    return fs.readFileSync(f, 'utf8').split('\n');
}
const args = process.argv.slice(2);
if (args[0] === '--golden') {
    const golden = {};
    for (const c of CASES) golden[`${c.hell ? 'hell' : 'day'}/${c.char}/${c.seed}`] = record(args[1], c).map(digestPlan);
    const out = path.join(__dirname, '..', 'test', 'golden-plans.json');
    fs.writeFileSync(out, JSON.stringify(golden));
    console.log('wrote', out, Object.values(golden).reduce((n, a) => n + a.length, 0), 'plans from', args[1]);
    process.exit(0);
}
if (args.length < 2) { console.error('usage: plan-diff.js <buildA> <buildB>  |  --golden <build>'); process.exit(2); }
const { samePlan } = require(scenesMod);
let bad = 0, total = 0;
for (const c of CASES) {
    const a = record(args[0], c), b = record(args[1], c);
    for (let i = 0; i < a.length; i++) {
        total++;
        if (!samePlan(a[i], b[i])) { bad++; if (bad <= 3) console.log(`DIFF ${c.hell ? 'hell' : 'day'}/${c.char}/seed${c.seed} plan#${i}\n  A: ${a[i].slice(0, 240)}\n  B: ${b[i].slice(0, 240)}`); }
    }
}
console.log(`${total} plans compared, ${bad} differ`);
process.exit(bad ? 1 : 0);

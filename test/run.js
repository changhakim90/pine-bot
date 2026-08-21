#!/usr/bin/env node
// Runs every scenario in test/scenario.js in its own process; exit 1 on any failure.
const { spawnSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');
const scenarios = ['snapshots', 'scoring', 'hell-unban', 'pat-profile', 'boss-floor', 'directives', 'time-stop', 'flight', 'hell-southside'];
console.log('pine-bot tests v' + pkg.version);
let failed = 0;
for (const s of scenarios) {
    console.log('\n[' + s + ']');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'scenario.js'), s], { stdio: 'inherit', timeout: 30000 });
    if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} scenario(s) FAILED` : '\nall tests passed');
process.exit(failed ? 1 : 0);

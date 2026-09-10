#!/usr/bin/env node
// Runs every scenario in test/scenario.js in its own process; exit 1 on any failure.
const { spawnSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');
const scenarios = require('./scenario-list');
console.log('pine-bot tests v' + pkg.version);
let failed = 0;
for (const s of scenarios) {
    console.log('\n[' + s + ']');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'scenario.js'), s], { stdio: 'inherit', timeout: 30000 });
    // v6.135.0 AUDIT C2: a timeout used to be indistinguishable from an
    // assertion failure — status null, no FAIL line, and the last `ok` printed
    // looked like the culprit. Twice in one session that sent the wrong test
    // under investigation. Name it.
    if (r.error && r.error.code === 'ETIMEDOUT') { console.log('  TIMEOUT ' + s + ' (30 s) — killed, not a test failure'); failed++; }
    else if (r.status !== 0) { if (r.signal) console.log('  KILLED ' + s + ' by ' + r.signal); failed++; }
}
console.log(failed ? `\n${failed} scenario(s) FAILED` : '\nall tests passed');
process.exit(failed ? 1 : 0);

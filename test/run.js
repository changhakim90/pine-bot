#!/usr/bin/env node
// Runs every scenario in test/scenario.js in its own process; exit 1 on any failure.
const { spawnSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');
const scenarios = ['snapshots', 'scoring', 'hell-unban', 'pat-profile', 'boss-floor', 'directives', 'time-stop', 'flight', 'hell-southside', 'ult-falloff', 'flame-cross', 'backlog', 'freeze-aura', 'damage-audit', 'focus-fire', 'item-stop', 'flame-anchor', 'kill-order', 'edge-boss', 'stop-giant', 'grind', 'gun-veto', 'learned', 'cem-heal', 'cem-lockup', 'ult-kinds', 'po-feasibility', 'tank-holdout', 'demo-digest', 'rotation', 'rotation-resume', 'rotation-doctrine', 'runner-posture', 'roster-cap', 'char-posture', 'gun-path', 'gun-forced', 'craft-prompt', 'evo-tip', 'audit-signal', 'audit-craft', 'audit-clicks', 'levelup-repeat', 'levelup-miss', 'chrome-veto', 'corner-anchor', 'mark-escape', 'underpowered-label', 'slot-lockout', 'latent-line', 'shield-pool', 'ult-chain', 'kite-damp', 'kite-deadband', 'income-audit', 'panic-anchor', 'minguk-invuln', 'mark-ghost', 'deep-park', 'dormant-hunt', 'freeze-slot', 'arming-cap'];
console.log('pine-bot tests v' + pkg.version);
let failed = 0;
for (const s of scenarios) {
    console.log('\n[' + s + ']');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'scenario.js'), s], { stdio: 'inherit', timeout: 30000 });
    if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} scenario(s) FAILED` : '\nall tests passed');
process.exit(failed ? 1 : 0);

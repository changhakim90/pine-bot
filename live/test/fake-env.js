// Minimal browser + game fake so the userscript can be loaded in Node.
// Exposes a loader that returns window.pineBot with the script booted.
module.exports = function makeEnv(opts = {}) {
    const store = Object.assign({}, opts.storage || {});
    global.localStorage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        _store: store
    };
    const mkEl = () => ({ style: {}, children: [], querySelector: () => mkEl(), querySelectorAll: () => [], appendChild() {}, remove() {}, classList: { contains: () => true }, set innerHTML(v) {}, textContent: '' });
    global.document = { readyState: 'complete', body: Object.assign(mkEl(), { children: [] }), getElementById: () => null, createElement: () => mkEl(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false };
    global.window = global;
    let frames = 0;
    const maxFrames = opts.frames || 0;
    global.requestAnimationFrame = cb => { if (frames++ < maxFrames) setTimeout(cb, 5); return 1; };
    global.cancelAnimationFrame = () => {};
    global.getComputedStyle = () => ({});
    global.KeyboardEvent = class {}; global.MouseEvent = class {}; global.PointerEvent = class {};
    global.navigator = {};
    // game globals (lexical in the real page; global properties resolve the same way here)
    Object.assign(global, {
        player: { x: 270, y: 270, hp: 100, maxHp: 120, speed: 2.375 },
        enemies: [], eprojectiles: [], pickups: [], dropMarks: [], roadLines: [],
        state: 'title', gameTime: 0, hell: false, killCount: 0, money: 0, keys: {}, W: 540, H: 540, frame: 1
    }, opts.game || {});
    global.tryDash = () => {}; global.useUltimate = () => {};
    // v6.88.1: the real page exposes pickUpgrade(index); handleLevelUp now
    // refuses to record a pick that did not land, so the harness has to be able
    // to accept one. `picks` is the receipt the level-up scenarios assert on.
    global.picks = [];
    if (opts.noPickUpgrade) delete global.pickUpgrade;
    else global.pickUpgrade = i => { global.picks.push(i); };
    const src = require('fs').readFileSync(opts.script, 'utf8');
    // capture the bot's console output for the lifetime of the process
    // (autoStart fires 900 ms after boot; each scenario runs in its own process)
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => { const line = a.map(String).join(' '); if (/^\[PineBot\]|^%c\[PineBot\]/.test(line)) logs.push(line); else origLog(...a); };
    new Function(src)();
    return { pineBot: global.window.pineBot, store, logs };
};

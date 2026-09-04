// ==UserScript==
// @name         Pine Speed
// @namespace    pine-bot
// @version      1.1.0
// @description  Speed up Pine & Co. The game is FRAME-COUNTED (gameTime = frames/60; verified: a 100x performance.now patch left gameTime at 1x), so speed = more virtual animation frames: each real display frame drains the rAF queue `mult` times. Multiplier from localStorage.pineSpeed; default 100. Set localStorage.pineSpeed='1' and reload for manual play.
// @match        https://pineandco.online/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
    'use strict';
    let mult = 100;
    try {
        const v = parseFloat(localStorage.getItem('pineSpeed'));
        if (isFinite(v) && v > 0) mult = Math.min(1000, v);
    } catch (e) { /* storage blocked: keep default */ }
    if (mult === 1) return;

    // ---- virtual clock: keeps any performance.now readers consistent with
    // the virtual frame rate (harmless if unused) --------------------------
    const origNow = performance.now.bind(performance);
    const base = origNow();
    performance.now = function () { return base + (origNow() - base) * mult; };

    // ---- rAF multiplier (the part that actually speeds this game) --------
    // The game loop re-registers itself inside its callback, so calling the
    // callback k times directly would register k new callbacks and explode.
    // Instead: intercept the queue, and per REAL frame run `mult` VIRTUAL
    // frames, each draining the queue once — re-registrations land in the
    // next virtual frame, exactly like real time, just 100x denser.
    const origRAF = window.requestAnimationFrame.bind(window);
    let queue = [];            // [{ id, cb }]
    let nextId = 1;
    const cancelled = new Set();
    window.requestAnimationFrame = function (cb) {
        const id = nextId++;
        queue.push({ id, cb });
        return id;
    };
    window.cancelAnimationFrame = function (id) { cancelled.add(id); };
    let virt = base;
    const STEP = 1000 / 60;    // one virtual 60fps frame, in virtual ms
    origRAF(function tick() {
        const rounds = Math.max(1, Math.round(mult));
        for (let k = 0; k < rounds; k++) {
            if (!queue.length) break;
            const cbs = queue; queue = [];
            virt += STEP;
            for (const entry of cbs) {
                if (cancelled.has(entry.id)) { cancelled.delete(entry.id); continue; }
                try { entry.cb(virt); } catch (e) { /* one bad frame must not kill the loop */ }
            }
        }
        origRAF(tick);
    });

    try { window.__pineSpeed = mult; } catch (e) { }
    try { console.log('[PineSpeed] rAF x' + mult + ' (frame-counted game)'); } catch (e) { }
})();

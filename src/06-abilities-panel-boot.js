
    function maybeAbilities(plan) {
        const now = Date.now();
        const A = CONFIG.abilities;
        // DASH (defensive): the lower our HP, the earlier we bail out — and
        // standing inside a telegraphed blast zone is an emergency that
        // overrides the normal danger threshold entirely.
        // DEMO-CORRECTED dash cadence: at depth the manual run dashes ~59x
        // per minute while slowed 71% of the time — the dash is how you move
        // when frozen ground is permanent. Deep hell + slowed relaxes both
        // the danger bar and the rate limit; the day game stays disciplined.
        const deepHell = hellDetected && (typeof G.gameTime === 'number' ? G.gameTime : 0) > 2400;
        const slowedNow = plan.slowMul != null ? plan.slowMul < 0.95 : false;
        // USER DOCTRINE: in hell the dash is contact insurance against bodies
        // that have scaled past killable — EXCEPT while a time-pause item is
        // holding the field, where nothing is moving and a dash is wasted.
        const hellDash = hellDetected && plan.pauseActive !== true;
        const dashThreshold = A.dashDangerScore * (0.4 + 0.8 * plan.hpRatio) *
            ((deepHell && slowedNow) ? 0.45 : (hellDash ? 0.6 : 1));
        const inBlastZone = dangerAccum.mark > 1.5 || dangerAccum.line > 1.5;
        // about to be hit by a telegraphed blast we are standing in
        const blastImminent = plan.blastImminent === true;
        // DEEP HELL (v6.82.0): the gate tightens with depth — 650 ms at the
        // 2-hour mark sliding toward CONFIG.deepHell.dashGateMs at full depth
        const depthNow = plan.depth || 0;
        const deepGate = Math.round(650 + (CONFIG.deepHell.dashGateMs - 650) * depthNow);
        const dashGate = plan.flight ? 300
            : (deepHell && slowedNow) ? Math.min(A.dashCooldownMs, 420)
            : (hellDash ? Math.min(A.dashCooldownMs, deepGate) : A.dashCooldownMs);
        // v6.89.8 THE DASH CARRIES NO I-FRAMES. Read whole from source:
        //
        //   function tryDash(dirx,diry){ ... player.dashDx=dirx; player.dashDy=diry;
        //     player.dashUntil=gameTime+0.16; player.dashReadyAt=gameTime+dashCd(lv); ... }
        //
        // No invuln, no dashInvuln, nothing the contact loop's `!isInvuln()`
        // gate would see. So the dash is a 0.16 s speed burst along whatever
        // heading the planner already picked — a MULTIPLIER on that decision,
        // never a defence in its own right.
        //
        // Two consequences at depth. It cannot open a gap: bodies measured at
        // 50-119 px/frame cover the whole 540 px arena in 4-11 frames, so the
        // burst is spent against something that re-closes inside the same
        // window. And when the planner is in panic the heading is a flee
        // vector, so dashing AMPLIFIES the move away from the corner — the
        // user's observation, and the mechanism behind it.
        //
        // The deepest demo ever recorded (178:19 → 244:04, crowdMedian 234,
        // hpMedian 100) logs `dashes: 0`. The "~59 dashes/min" comment above
        // comes from a shallower run; where the two disagree, the one that
        // reached 244 minutes wins.
        //
        // So past deep-hell depth the dash is allowed only when amplifying the
        // heading is actually useful: it points at the corner, or it is
        // escaping a blast/mark — the one hazard class position still defeats
        // (corner mark-immunity is geometric: 80.9 px against a 70 px reach).
        // USER DIRECTIVE (6.89.8): "without dashing on panic mode in deep hell
        // ... and anchor towards one of the four corners." Panic is precisely
        // when the heading is a flee vector, so it is precisely when amplifying
        // it does the most damage. Escaping a blast or a mark still overrides —
        // that is the one hazard class a position change actually defeats.
        // v6.89.12 THE PANIC GATE WAS NOT BITING (user: "still dashing away
        // instead of anchoring when in panic mode"). Two independent leaks, and
        // either alone was enough to defeat it.
        //
        // 1. THE DEPTH KEY WAS A 40-MINUTE CLOCK. `deepHell` is
        //    `hellDetected && gameTime > 2400`, but the measured median run is
        //    1325 s — twenty-two minutes. The MAJORITY of runs, and therefore of
        //    deaths, never reached the gate at all.
        //
        //    The right key is not a clock, it is the same physics that governs
        //    the kite: a dash is a 0.16 s movement burst with no i-frames, so if
        //    the pack cannot be outrun, a burst cannot open a gap either.
        //    `outrunnable` measures exactly that, live, per frame — and per the
        //    source speed curve it turns false around minute eleven, not forty.
        //
        // 2. `inBlastZone` IS A DECAYING ACCUMULATOR, NOT A HAZARD TEST.
        //    `dangerAccum` adds 0.25 per overlapping tick and decays x0.96, so
        //    it sits near 6.25 while a mark is on us and takes ~35 ticks to fall
        //    back under the 1.5 threshold. It answers "was there a mark on me
        //    recently", which kept `escaping` true — and short-circuited the
        //    whole suppression — long after the hazard had gone.
        //
        // Escaping now asks the instantaneous questions only: am I standing in
        // a mark, in a lane, or under a blast that is about to land.
        const escaping = blastImminent || plan.markHere === true || plan.lineHere === true;
        const cornered = plan.outrunnable === false;
        const deepPanic = cornered && (plan.panic === true || plan.hpPanic === true);
        const cornerHeld = plan.cornerAnchor === true;
        const dashProductive = escaping ||
            (!deepPanic && (!cornerHeld || plan.cornerward === true));
        if (A.dashEnabled && dashProductive && hasGame('tryDash') && now - lastDash > dashGate &&
            (plan.danger > dashThreshold || inBlastZone || plan.projImminent || plan.laneUrgent ||
                plan.rivalUrgent || plan.frozenUrgent || plan.sprinterUrgent || plan.contactImminent ||
                plan.flight || blastImminent)) {
            lastDash = now;
            callGame('tryDash', plan.dx, plan.dy);
        }
        // ULTIMATE (damage + INVINCIBILITY): best spent when damage is coming
        // regardless of movement. Triggers, in value order:
        //  - emergency: planner danger far past the dash threshold = an
        //    unavoidable hit — the invincibility eats it
        //  - hell-entry onslaught with a wave already on top of us
        //  - mid-surge crowds, big crowds, low HP, boss, panic-surrounded,
        //    losing the DPS race
        const defensive = plan.panic && plan.near >= 4;
        const offensive = plan.boss || (dpsDeficit > 0.6 && plan.near >= Math.ceil(A.ultCrowd * 0.7));
        const emergency = plan.danger > A.dashDangerScore * 1.6;
        const entryHold = plan.hellRecent && plan.near >= 5;
        const surgeCrowd = plan.surge && plan.near >= 5;
        // passout harvest (user: use the ult AGGRESSIVELY here): ANY passout
        // in range is an ult payday — damage + invincibility, and the loot
        // funds the build. The game's own cooldown is the only limiter.
        // fire from the middle of the group when possible (the spiral covers
        // everyone); a big cluster or a lone passout in range fires anyway
        // v6.86.1 PER-CHARACTER ULT DOCTRINE. Everything below this line used
        // to assume minguk's nuke. Read from the live source:
        //   nuke  (minguk): dealDmg(e, 1e7*2.5^(lv-1)) to EVERY enemy,
        //     passouts included — a passout field is genuinely free loot, so
        //     the harvest/lootTargets doctrine stands unchanged.
        //   spray (pat) / aura (joe): no field-wide damage at all. A passout
        //     carries d.hp*strength*2 HP (strength = 8*(1+(estBoss-1)*0.7)*
        //     (1+gt/60*0.22)) — tens of thousands by minute 10 — while pat's
        //     spiral pays dmg*9.6*2^(lv-1) per projectile scattered in every
        //     direction and joe's spikes reach ~149px. Spending those on a
        //     passout cluster buys nothing; their value is the invulnerability
        //     window and what is ALREADY next to us.
        const CH = charOf();
        const nukeUlt = CH.ultKind === 'nuke' || CH.ultKind == null;
        const ultAdj = A.ultAdjacent || 130;
        const adjacentNow = isFinite(plan.adjacent) ? plan.adjacent <= ultAdj : (plan.near >= 3);
        // v6.86.2 CORRECTION (user, confirmed by the source arithmetic):
        // "the only way pat can clear out passouts consistently is through
        // flame crosses and ultimates". 6.86.1 went too far by taking
        // passouts off the spray/aura target list entirely. The right rule is
        // RANGE, not target type: pat's spiral pays 39 volleys x 3 arms x 691
        // (80k at lv1, 636k at lv3) but only into what it sweeps, and joe's
        // spikes cover ~149px. A passout is 27k HP at 15 min and 77k at 20 —
        // hopeless for base attacks, routine for an ult fired while hugging
        // it. So: passout + adjacent = fire; passout across the floor = no.
        const poAdjacent = plan.poNearest != null && plan.poNearest <= ultAdj;
        const harvest = !plan.hpPanic && (nukeUlt
            ? ((plan.passoutsNear || 0) >= 3 ||
               ((plan.passoutsNear || 0) >= 1 && (plan.poCentroidDist == null || plan.poCentroidDist < 80)))
            : poAdjacent);
        // v6.85.8 (user: "the bot should be using the ultimate more frequently
        // to kill passouts"). Adding another TRIGGER would have done nothing —
        // `lootTargets` already fires on any passout within 190px, so every
        // trigger-shaped version of this was measured redundant. What actually
        // limits the rate is the RETRY GATE: the bot asks the game for the ult
        // every ultCooldownMs, so a passout can sit in range for over a second
        // after the game's own cooldown ends. With a passout in falloff range
        // the retry drops to 900 ms so the ult goes off as soon as the game
        // allows it. callGame is a no-op while the real cooldown runs.
        // the retry gate drops for ANY bartender standing on a passout — the
        // sooner the game's own cooldown is cashed in, the more bodies clear
        const poClose = !plan.hpPanic && plan.poNearest != null && plan.poNearest < 120;
        // USER DOCTRINE: an available ultimate is SPENT on the high-loot
        // targets — NO BOOKING walls (42x hp: the ult burst breaks the
        // siege open), bosses in range, and passout clusters. Damage +
        // invincibility, and the loot funds the build.
        // MINGUK ULT DOCTRINE (user): the ultimate is the roaming-boss and
        // passout killer — any of them in range is reason enough to fire.
        const lootTargets = !plan.hpPanic && (nukeUlt
            ? (plan.wallNear === true || plan.bossNear === true || (plan.passoutsNear || 0) >= 1 ||
               plan.roamingBoss === true)
            // spray/aura: only what the ult can actually reach counts, and a
            // passout is never a reason to burn it
            : (poAdjacent || ((plan.wallNear === true || plan.bossNear === true) && adjacentNow)));
        const linebackerBurst = !plan.hpPanic && (plan.lines || 0) > 0 && plan.boss === true;   // charging linebacker: ult damage + invincibility
        // USER: when mob HP scales past what five supers can kill, the ult
        // becomes the regular clear tool — fire on cooldown into any group.
        const scalingMobs = (plan.toughness || 0) > 2 && plan.near >= 2 && !plan.hpPanic &&
            (nukeUlt || adjacentNow);
        // v6.86.1: for the two invulnerability ults, "something is about to
        // hit me and bodies are close" IS the payoff — spend it there rather
        // than saving it for a harvest that cannot happen.
        const survivalUlt = !nukeUlt && (plan.hpRatio < 0.55 || plan.contactImminent === true ||
            plan.flight === true || (plan.panic === true && adjacentNow));
        // DEEP RUN (user): past ~80 minutes, or any time flight mode is on,
        // the ult goes off on cooldown — killing is how a TIME STOP drops,
        // and the invincibility window is free survival either way.
        const gtDeep = typeof G.gameTime === 'number' ? G.gameTime : 0;
        // NOTE (v6.85.6): dropping `!hpPanic` here was tried and reverted —
        // it is unreachable. Flight requires near >= 4, hpPanic implies panic,
        // and `defensive` (panic && near >= 4) already fires the ult in every
        // low-HP flight state. The directive's "using ultimate" is satisfied
        // by that path; the fix that actually mattered was flight itself
        // staying on at low HP, which is what opens the 300 ms dash gate.
        const ultSpam = !plan.hpPanic && (plan.flight === true || (hellDetected && gtDeep > 4800));
        // DEEP HELL (v6.82.0): a body about to land on us at depth is the
        // hit that ends 68% of runs — if the ult is up, its invincibility
        // window is worth more than any harvest it was being saved for.
        const contactSave = CONFIG.deepHell.ultOnContact && plan.contactImminent === true && (plan.depth || 0) > 0;
        // FIRST-20-MINUTES AGGRESSION (user): during the funding phase the
        // ult is retried at double cadence — every passout cleared early is
        // loot, XP, and upgrade potential compounding for the whole run.
        const gtU = typeof G.gameTime === 'number' ? G.gameTime : 0;
        let ultGate = (gtU < 1200 && !hellDetected) ? A.ultCooldownMs * 0.6 : A.ultCooldownMs;
        if (poClose) ultGate = Math.min(ultGate, 900);
        // v6.88.2 ULT CHAIN — the deep-hell engine, measured off manual demo #5
        // (178:19 -> 244:04, 9001 samples): hpMedian 100 with 234 enemies inside
        // 90 px, held by 2174 casts / 3945 s = one every 1.81 s against pat's
        // 2.834 s invulnerability window. The windows overlap and never lapse.
        //
        // The trigger for this already existed (`ultSpam`, past 80 min). The
        // limiter is this RETRY GATE: asking every 2500 ms is LONGER than the
        // window itself, and each time the retry misses the edge of the game's
        // real cooldown the chain opens for another 2.5 s. `callGame` is a
        // no-op while the real cooldown runs, so a tight retry costs nothing.
        // Only the two invulnerability ults qualify — minguk's nuke grants no
        // invulnerability at all, and its damage (1e7*2.5^(lv-1) = 9.8e8 at
        // Lv6) falls behind enemy HP (x1.4/180 s) at about 100 minutes, so
        // chaining it would burn the retry budget for nothing.
        // v6.88.2 (user): applied to ALL characters past the deep-deep
        // threshold, not only the two invulnerability ults. For spray/aura it
        // is load-bearing — the window is the only thing that stops the
        // contact loop. For minguk's nuke it is close to a no-op down here
        // (1e7*2.5^5 = 9.8e8 against enemy HP that passes it around 100 min,
        // and no invulnerability at all), but callGame is a no-op while the
        // real cooldown runs, so a tight retry costs nothing and keeps the
        // rule uniform.
        // v6.89.9: ALL THREE ults grant invulnerability — isInvuln() returns true
        // for ultUntil (joe), ultSpiralUntil (pat) AND the bare `claseUlt` object
        // (minguk). The old spray/aura test encoded a distinction that does not
        // exist in the source. Kept as a constant so the ultKind semantics stay
        // documented, but it no longer gates anything.
        const invulnUlt = true;   // was: CH.ultKind === 'spray' || CH.ultKind === 'aura'
        void invulnUlt;
        const DH = CONFIG.deepHell;
        const ultChain = hellDetected && gtU > (DH.ultChainFromS || 9000);
        if (ultChain) ultGate = Math.min(ultGate, DH.ultChainGateMs || 300);
        // v6.89.8 FIRE ON AVAILABILITY (user): "ultimate every time it's
        // available, for that invincibility and chance to kill a potential mob
        // ... for the item drops."
        //
        // Every other trigger above optimises the ult as a DAMAGE tool with a
        // crowd count, an HP ratio, or a harvest lead attached. Demo #5 measured
        // the opposite: 2174 casts over 3945 s, fired the instant available,
        // doing zero damage to the passout it was aimed at — a shield re-upped
        // 33 times a minute. Against that, the bot's own measured deep cadence
        // was one cast per 218 s, roughly one per 120 the human made.
        //
        // Two payoffs, and both survive minguk's lack of an invulnerability
        // window: the nuke still hits EVERY enemy on the field, and kills are
        // what drop items — which at depth means TIME STOPS, the one resource
        // that actually stops a pack moving 15-35x the player's speed. Holding
        // a charge back for a better moment is holding back the drop economy.
        //
        // `callGame` is a no-op while the game's real cooldown runs, so asking
        // every tick costs nothing but the call. `ultAlways` deliberately
        // bypasses `!plan.hpPanic` — being hurt is not a reason to save it.
        const ultAlways = hellDetected &&
            gtU > (DH.ultAlwaysFromS != null ? DH.ultAlwaysFromS : 2400);
        if (ultAlways) ultGate = Math.min(ultGate, DH.ultAlwaysGateMs || 250);
        if (A.ultEnabled && hasGame('useUltimate') && now - lastUlt > ultGate &&
            (plan.near >= A.ultCrowd || plan.hpRatio < A.ultHpRatio ||
                defensive || offensive || emergency || entryHold || surgeCrowd || harvest || lootTargets || linebackerBurst || scalingMobs || ultSpam || contactSave || survivalUlt ||
                ultChain || ultAlways)) {   // v6.88.2: deep + invuln ult = fire, unconditionally
            lastUlt = now;
            callGame('useUltimate');
            poReconsider();   // v6.86.2: the ult is the passout clear tool — re-open bodies the base attack gave up on
        }
    }

    // Last-resort movement when the real player object can't be read:
    // keep moving so the bot is never a stationary target.
    let orbitAngle = 0;
    function fallbackMove() {
        orbitAngle += 0.05;
        driveDirection(Math.cos(orbitAngle), Math.sin(orbitAngle * 0.7));
        moveSource = 'blind orbit (no game bindings)';
    }

    // =================================================================
    // MAIN LOOP
    // =================================================================
    function mainLoop() {
        if (!running) return;
        try {
            const now = Date.now();

            if (now - lastOverlay >= CONFIG.overlayMs) {
                lastOverlay = now;
                handleScreens();
                if (!running) return;   // a handler may have stopped us (hell record)
            }

            if (now - lastTick >= CONFIG.tickMs) {
                lastTick = now;
                const st = G.state;
                const playing = (st == null) ? true : (st === 'playing');
                if (playing) {
                    if (haveRealState()) {
                        const plan = planMove();
                        if (plan) {
                            lastPlan = plan;
                            moveSource = 'game state (exact)';
                            driveDirection(plan.dx, plan.dy);
                            maybeAbilities(plan);
                            if (runActive) deathSnapshot = snapshotStats();
                        }
                    } else {
                        fallbackMove();
                    }
                } else {
                    releaseAll();
                }
            }
        } catch (e) {
            // Never let an exception kill the rAF chain — that was the v4 bug.
            console.warn('[PineBot] loop error (recovered):', e);
        }
        rafId = requestAnimationFrame(mainLoop);
    }

    function startBot() {
        if (running) return;
        running = true;
        stopReason = null;
        applyParams(bestParams());
        lastTick = 0; lastOverlay = 0;
        rafId = requestAnimationFrame(mainLoop);
        setStatus('running');
        log('started');
    }
    function stopBot(reason) {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        releaseAll();
        stopReason = reason || null;
        setStatus(reason ? '⛔ ' + reason : 'stopped');
        log('stopped', reason || '');
    }

    // =================================================================
    // CONTROL PANEL
    // =================================================================
    let statusEl = null, infoEl = null;
    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

    function buildPanel() {
        if (!document.body || document.getElementById('pineBotPanel')) return;
        const el = document.createElement('div');
        el.id = 'pineBotPanel';
        // right-MIDDLE + translucent (user: the top-right spot covered the
        // cocktail/ingredient display). Solidifies on hover for readability.
        el.style.cssText = [
            'position:fixed', 'right:10px', 'top:50%', 'transform:translateY(-50%)', 'z-index:2147483647',
            'background:rgba(16,16,22,.55)', 'color:#eee', 'font:11px/1.45 ui-monospace,Menlo,monospace',
            'padding:9px 10px', 'border-radius:9px', 'min-width:215px', 'opacity:.75',
            'transition:opacity .15s,background .15s',
            'border:1px solid rgba(58,58,70,.6)', 'box-shadow:0 4px 18px rgba(0,0,0,.35)', 'user-select:none'
        ].join(';');
        el.onmouseenter = () => { el.style.opacity = '1'; el.style.background = 'rgba(16,16,22,.95)'; };
        el.onmouseleave = () => { el.style.opacity = '.75'; el.style.background = 'rgba(16,16,22,.55)'; };
        el.innerHTML =
            '<div style="font-weight:700;margin-bottom:5px;color:#ffd98a">🍸 Pine Bot v' + scriptTag() + '</div>' +
            '<div style="margin-bottom:6px">' +
            '<button id="pbStart" style="cursor:pointer">▶ Start</button> ' +
            '<button id="pbStop" style="cursor:pointer">■ Stop</button> ' +
            '<button id="pbDiag" style="cursor:pointer" title="Diagnostics">🔍</button> ' +
            '<button id="pbStats" style="cursor:pointer" title="Stats report — copy &amp; paste to Claude">📊</button> ' +
            '<button id="pbSnap" style="cursor:pointer" title="Version comparison — freeze a snapshot of this version and show every version side by side">📸</button> ' +
            '<button id="pbReset" style="cursor:pointer" title="Reset learning (version snapshots are kept)">↺</button> ' +
            '<button id="pbRec" style="cursor:pointer" title="Record YOUR manual play as a teaching demo — press once to start, again to stop; the digest opens ready to copy for Claude">🎥</button>' +
            '</div>' +
            '<div>status: <span id="pbStatus" style="color:#8fd">idle</span></div>' +
            '<div id="pbInfo" style="margin-top:5px;color:#aab"></div>';
        document.body.appendChild(el);
        statusEl = el.querySelector('#pbStatus');
        infoEl = el.querySelector('#pbInfo');
        el.querySelector('#pbStart').onclick = startBot;
        el.querySelector('#pbStop').onclick = () => stopBot();
        el.querySelector('#pbDiag').onclick = () => diagnose();
        el.querySelector('#pbStats').onclick = () => showReport(buildStatsReport());
        el.querySelector('#pbSnap').onclick = () => { snapshotNow('manual'); showReport(versionComparison()); };
        el.querySelector('#pbReset').onclick = resetLearn;
        el.querySelector('#pbRec').onclick = demoToggle;
        setInterval(demoTick, 160);

        setInterval(() => {
            if (!infoEl) return;
            const st = G.state;
            const p = lastPlan;
            const hidden = document.hidden === true;
            const vs = (learn.versions || {})[scriptTag()];
            // v6.88.0 AUDIT S1. This was innerHTML. `lastAction` is built in
            // clickEl from the clicked element's textContent — and the bot's
            // stuck-breaker clicks by TEXT across div/span/li, so a leaderboard
            // row carrying another player's display name can reach this line.
            // Concatenated into innerHTML on a 400 ms timer, a crafted name
            // executes in the game's origin. The static chrome is still markup;
            // every value that comes from the page goes in as a text node.
            const rows = [
                'tab: ' + TAB_ID + '   runs(all tabs): ' + learn.runs +
                    (vs && vs.n ? '   this ver: ' + vs.n + ' runs, best ' + Math.round(vs.bestT / 60) + 'm' : ''),
                hidden ? '\u26a0 background tab — game frozen by the browser; keep this window visible' : null,
                'state: ' + (st == null ? '(unreadable)' : st),
                'move: ' + moveSource,
                'build: ' + (primaryCocktail || '\u2014'),
                'picks: ' + runPicks.length,
                'model: CEM g' + learn.cem.gen + ' (' + learn.cem.batch.length + '/' + CONFIG.learning.batchSize + ')' +
                    (championRun ? ' \ud83d\udc51' : '') +
                    (lastDeathCause ? '   died\u2192' + lastDeathCause : '') +
                    (learn.hof.length && isFinite(learn.hof[0].r) ? '   best ' + learn.hof[0].r.toFixed(2) : '') +
                    (learn.genHistory.length >= 2
                        ? (learn.genHistory[learn.genHistory.length - 1] > learn.genHistory[learn.genHistory.length - 2] ? ' \u2191' : ' \u2193')
                        : ''),
                p ? p.diag : null,
                'last: ' + String(lastAction).slice(0, 34)
            ];
            infoEl.textContent = '';
            for (const r of rows) {
                if (r == null) continue;
                const line = document.createElement('div');
                line.textContent = r;
                infoEl.appendChild(line);
            }
        }, 400);
    }

    // =================================================================
    // DIAGNOSTICS + STATS REPORT
    // =================================================================
    // The 📊 report: everything needed to tune the bot from real data.
    // Copy it from the overlay and paste it to Claude for recommendations.
    function buildStatsReport() {
        const log = learn.runLog || [];
        const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0;
        const deaths = {};
        for (const e of log) if (e.death) deaths[e.death] = (deaths[e.death] || 0) + 1;
        const half = Math.floor(log.length / 2);
        return {
            report: 'PINE BOT STATS — paste this to Claude for tuning advice',
            version: scriptTag(),
            scoringProfile: CONFIG.scoringProfile,
            bartender: activeChar || '(bandit)', charProfile: charOf(),
            passoutFeasibility: (() => { const pl = lastPlan || {};
                return { killTimeS: pl.poTtk == null ? null : pl.poTtk, observedDps: pl.poDps || 0,
                         abandonedThisRun: pl.poGaveUp || 0, onField: pl.poField || 0 }; })(),
            runsTotal: learn.runs,
            runsLogged: log.length,
            byVersion: versionComparison(),
            averages: {
                time: avg(log.map(e => e.t)), downs: avg(log.map(e => e.d)),
                sales: avg(log.map(e => e.s)), reward: avg(log.map(e => e.r))
            },
            trend: log.length >= 6 ? {
                firstHalfAvgTime: avg(log.slice(0, half).map(e => e.t)),
                secondHalfAvgTime: avg(log.slice(half).map(e => e.t))
            } : 'need more runs',
            deathCauses: deaths,
            daysCleared: log.filter(e => e.day).length + '/' + log.length,
            hellRuns: log.filter(e => e.hell).length,
            bestRun: log.length ? log.reduce((a, b) => (b.r > a.r ? b : a)) : null,
            last10Runs: log.slice(-10),
            buildsUsed: Object.fromEntries(Object.entries(learn.builds).map(([k, v]) =>
                [k, { runs: +v.n.toFixed(1), mean: +(v.sum / v.n).toFixed(3) }])),
            // roster experiment scoreboard: how each candidate roster is
            // actually performing vs the prescribed incumbent
            rosterExperiment: {
                enabled: !!CONFIG.rosterExperiment,
                active: activeRoster,
                results: Object.fromEntries(Object.entries(learn.rosters || {}).map(([k, v]) =>
                    [k, { runs: +v.n.toFixed(1), mean: +(v.sum / Math.max(1e-9, v.n)).toFixed(3) }]))
            },
            improvementCurve: learn.genHistory.slice(-12),
            hallOfFame: learn.hof.map(h => +h.r.toFixed(3)),
            lastGradient: learn.lastGradient || null,
            strategyWeights: Object.fromEntries(Object.entries(CONFIG.strategy).map(([k, v]) => [k, +(+v).toFixed(2)])),
            currentRoadmap: { cocktails: PLAN_COCKTAILS.slice(), ingredients: PLAN_INGREDIENTS.slice(), hellUnbanApplied, avoidedIngredients: [...AVOID_INGREDIENTS] },
            cemGeneration: learn.cem.gen,
            hellEntryGaveUp: lastGiveUp
        };
    }

    function diagnose() {
        const api = ['goSelect', 'startGame', 'skipIntro', 'revealGame', 'pickUpgrade', 'closeTip',
            'confirmCraft', 'cancelCraft', 'pickCraftChoice', 'skipCraftChoice', 'closeNotice',
            'useUltimate', 'tryDash', 'saveScore', 'backToTitle', 'pauseGame', 'resumeGame',
            'finaleGo', 'finaleContinue', 'enterHell', 'nearestEnemy', 'weaponInfo'];
        const p = G.player;
        let keysWritable = false;
        try { keysWritable = writeKeyFlag('__pinebot_probe', true); writeKeyFlag('__pinebot_probe', false); } catch (e) { }

        const report = {
            version: scriptTag(),
            scoringProfile: CONFIG.scoringProfile,
            tab: TAB_ID,
            backgroundThrottled: document.hidden === true,
            running,
            state: G.state,
            playerReadable: !!p,
            player: p ? { x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, maxHp: p.maxHp, speed: p.speed } : null,
            counts: {
                enemies: Array.isArray(G.enemies) ? G.enemies.length : null,
                eprojectiles: Array.isArray(G.eprojectiles) ? G.eprojectiles.length : null,
                pickups: Array.isArray(G.pickups) ? G.pickups.length : null,
                dropMarks: Array.isArray(G.dropMarks) ? G.dropMarks.length : null,
                roadLines: Array.isArray(G.roadLines) ? G.roadLines.length : null
            },
            keysReadable: !!G.keys,
            keysWritable,
            gameTime: G.gameTime, killCount: G.killCount, money: G.money,
            field: fieldSize(),
            apiPresent: api.filter(hasGame),
            apiMissing: api.filter(n => !hasGame(n)),
            pool: (readPool() || []).map(c => ({ n: nameOf(c), type: c && c.type, lv: c && c.lv, maxlv: c && c.maxlv })),
            build: primaryCocktail,
            picks: runPicks,
            pickAudit,   // each recent selection: what won, its score, WHY, and what it beat
            lastRunStats,
            enemyMix: Object.fromEntries(Object.entries(enemyMix).map(([k, v]) => [k, +v.toFixed(1)])),
            scaling: {
                killRate: +killRate.toFixed(2), pressure: +pressureAvg.toFixed(2),
                toughness: +toughnessAvg.toFixed(2), dpsDeficit: +dpsDeficit.toFixed(2)
            },
            milestones: { supers: supersThisRun, crafts: craftsThisRun, rainbow: rainbowThisRun, dayCleared: dayClearedThisRun },
            lastPlan: lastPlan && lastPlan.diag,
            learning: {
                runs: learn.runs, totalPicks: learn.totalPicks, baseline: baseline(),
                hallOfFame: learn.hof.map(h => ({ mean: +h.r.toFixed(3), n: h.n || 1, best: +(h.best || h.r).toFixed(3) })),
                hofDistinct: learn.hof.length,
                sigmaAtFloor: +sigmasAtFloor().toFixed(2),
                restarts: (learn.cem && learn.cem.restarts) || 0,
                stalledGens: (learn.cem && learn.cem.stall) || 0,
                championRun,
                improvementCurve: learn.genHistory.slice(-12),
                lastGradient: learn.lastGradient || null,
                cem: {
                    generation: learn.cem.gen,
                    batch: learn.cem.batch.length + '/' + CONFIG.learning.batchSize,
                    mean: Object.fromEntries(Object.entries(learn.cem.mean).map(([k, v]) => [k, +v.toFixed(3)])),
                    explorationPct: Object.fromEntries(Object.entries(learn.cem.sigma).map(([k, v]) => {
                        const s = TUNABLE[k]; return [k, +((v / (s.max - s.min)) * 100).toFixed(0)];
                    })),
                    // CMA-ES-lite state: adaptive step size + strongest
                    // evolution-path directions (correlated-move memory)
                    stepSize: +(isFinite(learn.cem.ss) ? learn.cem.ss : 1).toFixed(3),
                    evolutionPath: Object.entries(learn.cem.pc || {})
                        .filter(([k, v]) => Math.abs(v) > 0.15)
                        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6)
                        .map(([k, v]) => k + (v > 0 ? ' +' : ' ') + v.toFixed(2))
                },
                contextualBandit: {
                    cardsTracked: Object.keys(learn.linucb || {}).length,
                    samples: +Object.values(learn.linucb || {}).reduce((a, m) => a + (m.n || 0), 0).toFixed(0)
                },
                rainbowPolicy: Object.fromEntries(Object.entries(learn.rainbowPolicy || {}).map(([k, v]) =>
                    [k, { n: +v.n.toFixed(1), mean: +(v.sum / Math.max(1e-9, v.n)).toFixed(3) }])),
                measuredSpawnTimetable: Object.fromEntries(Object.entries(learn.spawnIntel || {})
                    .filter(([k, v]) => v.n >= 1)
                    .map(([k, v]) => [k, { n: +v.n.toFixed(1), firstSeenS: Math.round(v.sum / v.n) }])),
                builds: learn.builds,
                rosterExperiment: {
                    enabled: !!CONFIG.rosterExperiment,
                    active: activeRoster,
                    results: Object.fromEntries(Object.entries(learn.rosters || {}).map(([k, v]) =>
                        [k, { runs: +v.n.toFixed(1), mean: +(v.sum / Math.max(1e-9, v.n)).toFixed(3) }]))
                },
                versionSnapshots: (learn.snapshots || []).map(s => s.version + ' (' + (s.runs == null ? 'seeded' : s.runs + ' runs') + ')'),
                lastDeathCause
            },
            moveSource, lastAction, stopReason, lastGiveUp
        };
        console.log('%c[PineBot] DIAGNOSTICS', 'font-weight:bold;color:#ffd98a', report);
        showReport(report);
        return report;
    }

    function showReport(report) {
        const old = document.getElementById('pineBotReport');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'pineBotReport';
        el.style.cssText = 'position:fixed;left:10px;top:10px;right:250px;max-height:70vh;overflow:auto;z-index:2147483647;' +
            'background:rgba(10,10,14,.96);color:#cfe;font:10px/1.4 ui-monospace,monospace;padding:10px;border-radius:8px;border:1px solid #3a3a46';
        const close = document.createElement('button');
        close.textContent = 'close';
        close.style.cssText = 'float:right;cursor:pointer';
        close.onclick = () => el.remove();
        const copy = document.createElement('button');
        copy.textContent = 'copy';
        copy.style.cssText = 'float:right;cursor:pointer;margin-right:6px';
        copy.onclick = () => { try { navigator.clipboard.writeText(JSON.stringify(report, null, 2)); copy.textContent = 'copied'; } catch (e) { } };
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(report, null, 2);
        el.appendChild(close);
        el.appendChild(copy);
        el.appendChild(pre);
        document.body.appendChild(el);
    }

    // =================================================================
    // DEMO RECORDER — records the USER'S manual runs (bot stopped) as a
    // behavioral reference: positions vs targets, dodge timing, ult/dash
    // usage, and every level-up choice with the pool it was chosen from.
    // Stored in localStorage 'pineBotDemos' (last 4 runs) for analysis.
    // =================================================================
    let demoRec = null;
    function demoToggle() {
        if (demoRec) { demoSave(); return; }
        demoRec = { at: Date.now(), samples: [], events: [] };
        try {
            if (!window.__demoWrapped) {
                window.__demoWrapped = true;
                const wrap = (fn, tag) => {
                    const orig = window[fn];
                    if (typeof orig !== 'function') return;
                    window[fn] = function () {
                        if (demoRec) demoRec.events.push({ t: Date.now() - demoRec.at, e: tag,
                            gt: Math.round(safe(() => gameTime, 0) || 0),
                            a: tag === 'pick' ? [arguments[0], (readPool() || []).map(c => nameOf(c))] : undefined });
                        return orig.apply(this, arguments);
                    };
                };
                wrap('pickUpgrade', 'pick'); wrap('useUltimate', 'ult'); wrap('tryDash', 'dash');
            }
        } catch (e) { }
        setStatus('🎥 RECORDING your manual play — press 🎥 again to save');
    }
    function demoSave() {
        if (!demoRec) return;
        try {
            const all = JSON.parse(localStorage.getItem('pineBotDemos') || '[]');
            all.push({ at: demoRec.at, n: demoRec.samples.length, samples: demoRec.samples, events: demoRec.events });
            while (all.length > 4) all.shift();
            localStorage.setItem('pineBotDemos', JSON.stringify(all));
            setStatus('🎥 saved demo: ' + demoRec.samples.length + ' samples, ' + demoRec.events.length + ' events');
            demoRec = null;
            showReport(demoDigest());   // v6.86.3: the digest is what gets pasted to Claude
            return;
        } catch (e) { setStatus('demo save failed: ' + e.message); }
        demoRec = null;
    }
    // v6.86.3 DEMO DIGEST. A 20-minute demo is ~9k samples — far too big to
    // hand over. The questions a teaching demo has to answer are few, so the
    // analysis runs HERE and emits a few KB: how close the human stands to a
    // passout, whether an ultimate actually clears one, when the first super
    // and the armour levels land, and what HP they accept before backing off.
    function demoDigest(idx) {
        let all = [];
        try { all = JSON.parse(localStorage.getItem('pineBotDemos') || '[]'); } catch (e) { }
        const d = all[idx == null ? all.length - 1 : idx];
        if (!d || !d.samples || !d.samples.length) return { error: 'no demo recorded yet — press 🎥, play a run, press 🎥 again' };
        const S = d.samples, E = d.events || [];
        const pct = (a, q) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };
        const at = gt => { let best = null, bd = 1e9; for (const s of S) { const dd = Math.abs((s.gt || 0) - gt); if (dd < bd) { bd = dd; best = s; } } return best; };
        const firstWhere = f => { for (const s of S) if (f(s)) return s.gt; return null; };
        // where does the human STAND while farming a passout?
        const near200 = S.filter(s => s.poD != null && s.poD < 200).map(s => s.poD);
        // did an ultimate clear a passout? compare the nearest body's HP 3s later
        const ults = E.filter(e => e.e === 'ult').map(e => {
            const a = at(e.gt), b = at(e.gt + 3);
            return { gt: e.gt, ultLv: a ? a.ulv : null, poD: a ? a.poD : null,
                     poHpBefore: a ? a.poHp : null, poHpAfter: b ? b.poHp : null,
                     poCountBefore: a ? a.poN : null, poCountAfter: b ? b.poN : null };
        });
        const hurt = S.filter(s => s.near >= 3).map(s => s.hp);
        // v6.86.6: the day and the deep game are different problems — the
        // 90-minute demo fired 13 of 14 recorded casts with ZERO passouts on
        // the floor, stood in crowds of 18-220 at 100% HP and never dashed,
        // while the day demos lived at 79-82px off a passout with crowd p75
        // of 0-1. Pooling those into one set of percentiles hides both.
        const phaseOf = s => (s.gt < 1200 ? 'day' : (s.gt < 3600 ? 'hell' : 'deep'));
        const phases = {};
        for (const key of ['day', 'hell', 'deep']) {
            const P = S.filter(s => phaseOf(s) === key);
            if (!P.length) continue;
            const po = P.filter(s => s.poD != null && s.poD < 200).map(s => s.poD);
            phases[key] = {
                samples: P.length, fromGt: P[0].gt, toGt: P[P.length - 1].gt,
                passoutStationMedian: pct(po, 0.5), passoutSamples: po.length,
                passoutsOnFieldMax: Math.max(...P.map(s => s.poN || 0)),
                hpP10: pct(P.map(s => s.hp), 0.1), hpMedian: pct(P.map(s => s.hp), 0.5),
                crowdMedian: pct(P.map(s => s.near), 0.5), crowdP75: pct(P.map(s => s.near), 0.75),
                crowdMax: Math.max(...P.map(s => s.near || 0)),
                ults: E.filter(e => e.e === 'ult' && phaseOf({ gt: e.gt }) === key).length,
                dashes: E.filter(e => e.e === 'dash' && phaseOf({ gt: e.gt }) === key).length
            };
        }
        const lvAt = k => { const out = {}; for (const s of S) { const v = s[k] || 0; if (v && out[v] == null) out[v] = s.gt; } return out; };
        return {
            note: 'MANUAL DEMO DIGEST — paste this to Claude',
            version: scriptTag(), char: safe(() => player.key, null),
            durationS: Math.round((S[S.length - 1].gt || 0) - (S[0].gt || 0)),
            reachedGt: S[S.length - 1].gt, samples: S.length,
            passoutStation: {
                note: 'distance to the NEAREST passout while one is within 200px',
                p10: pct(near200, 0.1), p25: pct(near200, 0.25), median: pct(near200, 0.5),
                p75: pct(near200, 0.75), samples: near200.length,
                shareUnder60px: +(S.filter(s => s.poD != null && s.poD < 60).length / S.length).toFixed(3),
                everOnField: Math.max(...S.map(s => s.poN || 0))
            },
            recordingStartedGt: S[0].gt,   // >0 means the recording began mid-run
            byPhase: phases,               // day <20min | hell 20-60 | deep 60min+
            ultimates: { count: ults.length, uses: ults.slice(0, 40) },
            build: {
                firstSuperGt: firstWhere(s => (s.sup || 0) >= 1),
                supersAtEnd: S[S.length - 1].sup || 0,
                ultLevelReached: Math.max(...S.map(s => s.ulv || 0)),
                ultLevelTimeline: lvAt('ulv'),
                oliveTimeline: lvAt('ol'), negroniTimeline: lvAt('ng'),
                picks: E.filter(e => e.e === 'pick').map(e => ({ gt: e.gt,
                    took: (e.a && Array.isArray(e.a[1])) ? e.a[1][e.a[0]] : null })).slice(0, 60)
            },
            posture: {
                flameShare: +(S.reduce((n, s) => n + (s.fx || 0), 0) / S.length).toFixed(3),
                // v6.88.2 — the two numbers that would have prevented this
                // session's two wrong conclusions. invulnShare is measured
                // invulnerability, not `useUltimate` call count. cornerDist is
                // distance to the nearest arena corner: p25/median/p75, so the
                // corner posture can be read off a demo instead of a screenshot.
                invulnShare: +(S.reduce((n, s) => n + (s.inv || 0), 0) / S.length).toFixed(3),
                cornerDist: {
                    p25: pct(S.map(s => s.cnr).filter(v => v != null), 0.25),
                    median: pct(S.map(s => s.cnr).filter(v => v != null), 0.5),
                    p75: pct(S.map(s => s.cnr).filter(v => v != null), 0.75)
                },
                hpP10: pct(S.map(s => s.hp), 0.1), hpMedian: pct(S.map(s => s.hp), 0.5),
                hpMedianWhenCrowded: pct(hurt, 0.5), crowdedSamples: hurt.length,
                crowdP75: pct(S.map(s => s.near), 0.75), crowdMax: Math.max(...S.map(s => s.near || 0)),
                dashes: E.filter(e => e.e === 'dash').length
            }
        };
    }

    function demoTick() {
        if (!demoRec) return;
        const p = G.player; if (!p || G.state !== 'playing') return;
        const en = Array.isArray(G.enemies) ? G.enemies.filter(Boolean) : [];
        const fr = safe(() => frame, 0) || 0;
        let poD = null, bossD = null, wallD = null, near = 0, poHp = null, poN = 0;
        let frozenBossD = null, frozenN = 0, hpSum = 0, hpN = 0;
        const globalStop = typeof p.timeStopUntil === 'number' && p.timeStopUntil > fr;
        for (const e of en) {
            const dd = Math.hypot(e.x - p.x, e.y - p.y);
            const ty = String(e.type), bc = String(e.bossChar || '');
            // v6.88.0 AUDIT R3: a TIME STOP item sets player.timeStopUntil
            // ONLY; frozenUntil is WHISKY SOUR's per-enemy freeze. The planner
            // was fixed to OR the two; demoTick was not — so every manual demo
            // recorded frz: 0, and the "how close does the human stand to a
            // PAUSED boss?" measurement that calibrated stopBossPull /
            // stopStation / the burn station was structurally zero in all of
            // them. Same class as the flameShare units bug.
            const froz = globalStop || (typeof e.frozenUntil === 'number' && e.frozenUntil > fr);
            if (froz) frozenN++;
            if (ty === 'passout') {
                poN++;
                if (poD == null || dd < poD) { poD = Math.round(dd); poHp = Math.round(e.hp || 0); }
                continue;
            }
            if (/nobook/i.test(bc + ty)) { if (wallD == null || dd < wallD) wallD = Math.round(dd); }
            else if (ty === 'boss') {
                if (bossD == null || dd < bossD) bossD = Math.round(dd);
                // STALL DOCTRINE: how close does the user get to a PAUSED boss?
                if (froz && (frozenBossD == null || dd < frozenBossD)) frozenBossD = Math.round(dd);
            }
            if (typeof e.hp === 'number' && ty !== 'boss' && ty !== 'passout') { hpSum += e.hp; hpN++; }
            if (dd < 90) near++;
        }
        // v6.88.2: two measurements the digest could never make. `cnr` is the
        // distance to the nearest arena corner — the corner hypothesis was
        // argued from geometry and a screenshot because x/y were recorded but
        // never summarised. `inv` is real invulnerability, which is how we
        // learned that 2174 logged `ults` were CALLS (most rejected) against a
        // 53.3 s cooldown, not casts.
        const fW = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
        const fH = (typeof G.H === 'number' && G.H > 0) ? G.H : CONFIG.field.h;
        const gtD = safe(() => gameTime, 0) || 0;
        const cnr = Math.round(Math.hypot(Math.min(p.x, fW - p.x), Math.min(p.y, fH - p.y)));
        const inv = ((typeof p.ultSpiralUntil === 'number' && p.ultSpiralUntil > gtD) ||
                     (typeof p.ultUntil === 'number' && p.ultUntil > gtD) ||
                     (typeof p.invuln === 'number' && p.invuln > 0)) ? 1 : 0;
        demoRec.samples.push({
            cnr, inv,
            t: Date.now() - demoRec.at, gt: Math.round(safe(() => gameTime, 0) || 0),
            x: Math.round(p.x), y: Math.round(p.y),
            hp: Math.round(100 * (p.hp / (p.maxHp || 1))),
            poD, bossD, wallD, near,
            marks: Array.isArray(G.dropMarks) ? G.dropMarks.filter(Boolean).length : 0,
            // stall-doctrine signals
            fbD: frozenBossD,                                    // distance to nearest PAUSED boss
            frz: frozenN,                                        // how many enemies are frozen (pause active?)
            slow: typeof p.slowMul === 'number' ? +p.slowMul.toFixed(2) : 1,   // freeze-aura exposure
            mobHp: hpN ? Math.round(hpSum / hpN) : 0,            // scaling proxy for ult-trigger tuning
            // v6.86.7: seconds, not frames — this is why every demo read flameShare 0
            fx: typeof p.fireCrossUntil === 'number' && p.fireCrossUntil > (safe(() => gameTime, 0) || 0) ? 1 : 0,
            // v6.86.3 — the build state, so a demo answers WHY the play worked
            poHp: poHp, poN: poN,                                // nearest passout HP + how many on the floor
            ulv: p.ultLevel || 0,
            ur: (safe(() => gameTime, 0) || 0) >= (p.ultReadyAt || 0) ? 1 : 0,
            sup: Object.keys(p.superLv || {}).length,
            ol: (p.weapons || {}).olive || 0, ng: (p.weapons || {}).negroni || 0
        });
        if (demoRec.samples.length > 9000) demoSave();   // ~24 min cap: autosave
    }

    // =================================================================
    // BOOT
    // =================================================================
    function boot() {
        buildPanel();
        applyParams(bestParams());
        saveLearn();   // persist the version-change freeze (and the 6.74.0 seed) immediately
        try {
            window.pineBot = {
                start: startBot, stop: stopBot, diagnose, reset: resetLearn,
                config: CONFIG, learn: () => learn, plan: () => lastPlan, state: () => G.state,
                version: SCRIPT_VERSION, tag: scriptTag(),
                // VERSION SNAPSHOTS
                compare: versionComparison,            // every version side by side, with deltas
                versions: versionReport,               // same table, best-time first (back-compat)
                restartSearch: () => restartSearch('manual'),   // v6.86.0: reopen the search by hand
                demo: demoDigest,                      // pineBot.demo() — digest of the last 🎥 recording
                demoRaw: () => { try { return JSON.parse(localStorage.getItem('pineBotDemos') || '[]'); } catch (e) { return []; } },
                snapshot: snapshotNow,                 // freeze THIS version's rollup now
                noteVersion,                           // pineBot.noteVersion('6.74.0', { bestTimeS: 15150, note: '...' })
                table: () => { try { console.table(versionRows().map(r => ({ version: r.version, status: r.status, runs: r.runs, medianMin: r.medianTimeS == null ? null : +(r.medianTimeS / 60).toFixed(1), meanMin: r.meanTimeS == null ? null : +(r.meanTimeS / 60).toFixed(1), sdMin: r.sdTimeS == null ? null : +(r.sdTimeS / 60).toFixed(1), p60: r.p60, p120: r.p120, bestMin: r.bestTimeS == null ? null : +(r.bestTimeS / 60).toFixed(1), hell: r.hellRate, z: r.vsPrev ? r.vsPrev.z : null, verdict: r.vsPrev ? r.vsPrev.verdict : '', note: r.note || '' }))); } catch (e) { } return versionRows(); },
                // pure functions exposed for unit testing
                test: {
                    scoreCard, isTopRecord, parseMoneyToken, parseResultScreen, computeReward,
                    hellTimeBonus, versionReport, versionComparison, versionRows, freezeSnapshot, rollupStats,
                    lineCost, sampleParams, gatherThreats, gatherLoot, computeRoadmap, planMove, maybeAbilities,
                    chooseRoster, rosterUcb,
                    roadmap: () => ({ cocktails: PLAN_COCKTAILS.slice(), ingredients: PLAN_INGREDIENTS.slice() }),
                    computeRoadmap, superKey: c => SUPER_KEY_INGREDIENT[c],
                    // v6.93.0: the CEM search box, so `runaway-guard` can test
                    // the SPACE rather than only the optimiser's position in it.
                    tunable: () => JSON.parse(JSON.stringify(TUNABLE)),
                    evolutionPending, takeCraftPrompt, stateHandlers: STATE_HANDLERS, handleScreens,
                    // v6.88.0 AUDIT: hooks for the regression suite
                    versionRows, applyParams, saveLearn, pruneVersions,
                    craftPending: () => craftPending, crafts: () => craftsThisRun,
                    resetCraftLatch: () => { craftPending = null; },
                    notNameForm, clickTextIf,
                    handleLevelUp, gunPathProgress,
                    activeRoster: () => activeRoster,
                    bossRing: () => bossRingRef.v,
                    // test-only: age the hell-entry stamp so the 90s entry
                    // window (`hellRecent`) is past and the boss-ring branch
                    // is reachable without sleeping for a minute and a half.
                    ageHellEntry: ms => { if (hellEnteredAt) hellEnteredAt -= (ms || 120000); },
                    // test-only: seed the level table. Several planner branches
                    // (zoner / MOJITO sniper / anchor) key on owned levels that
                    // are otherwise only learned from level-up cards.
                    setOwned: obj => { for (const k in obj) ownedLevels[k] = obj[k]; },
                    // v6.88.1: a pick that never landed must leave BOTH of these
                    // untouched — that is the whole assertion of levelup-miss.
                    getOwned: () => Object.assign({}, ownedLevels),
                    pickAudit: () => pickAudit.slice(),
                    setParam: (k, v) => setParam(k, v),
                    setEnemyMul: obj => { learn.enemyTypeMul = obj; },
                    hitTypes: () => Object.assign({}, hitTypeRun),
                    bossHitSamples: () => bossHitD.slice(),
                    applyDefaults: () => applyParams(DEFAULT_PARAMS),
                    sigmasAtFloor, paramDist, hofRecord,
                    charProfile: charOf,
                    setChar: b => { if (CHARS[b]) activeChar = b; },
                    // v6.86.11: the pat/minguk rotation is testable — the pin
                    // was lifted, and a rotation that silently stops rotating
                    // is exactly the 6.85.0 bug that cost a hundred runs.
                    activeChar: () => activeChar,
                    nextRotationChar, chooseBartender,
                    resetUltGate: () => { lastUlt = 0; }, resetPoTracking,
                    reloadLearn: () => { learn = loadLearn(); },
                    liveCrownTimeS   // v6.91.6: so the test can prove the STOP threshold still tracks the board
                }
            };
            // v6.85.12: pineBot.bossHitRange() — the measured boss damage ring.
            // Percentiles of the player->boss distance at every frame a boss
            // lost HP. p95 is the practical outer edge: past it our damage was
            // not landing. Compare against the ring the planner actually holds
            // (max(e.r+55, min(reach+10,150)) in hell, max(reach+60,240) in day).
            // v6.87.3: pineBot.gunForced() — every level-up pool that offered
            // nothing but off-plan super lines: when it happened, what was on
            // the table, and which one had to be eaten.
            window.pineBot.gunForced = () => ({
                n: gunForcedLog.length,
                note: gunForcedLog.length ? 'pools where every card advanced an off-plan super line'
                                          : 'no forced pool seen yet',
                pools: gunForcedLog.slice(-20)
            });
            window.pineBot.bossHitRange = () => {
                const a = bossHitD.slice().sort((x, y) => x - y);
                if (!a.length) return { n: 0, note: 'no boss damage observed yet — run until a boss is engaged' };
                const q = f => a[Math.min(a.length - 1, Math.floor(a.length * f))];
                return { n: a.length, min: a[0], p25: q(0.25), median: q(0.5), p75: q(0.75), p95: q(0.95), max: a[a.length - 1] };
            };
            // v6.85.13: pineBot.damageAudit() — what is ACTUALLY damaging us.
            // `byClass` counts every event where that hazard was in range;
            // `sole` counts only events where it was the ONLY candidate, which
            // is the ground truth. `unattributed` counts hits with NO hazard in
            // range at all — the existing classifier books those as 'contact',
            // so a large share here means the recorded death causes are wrong
            // and the hazard model is missing a damage source outright.
            window.pineBot.damageAudit = () => {
                const pct = (x, t) => t ? Math.round(100 * x / t) : 0;
                const q = (a, f) => { if (!a.length) return null; const s2 = a.slice().sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(s2.length * f))]; };
                const bd = dmgAudit.none.bossD, nr = dmgAudit.none.near;
                const shape = tbl => {
                    const o = {};
                    for (const k of Object.keys(tbl)) o[k] = { n: tbl[k].n, hp: Math.round(tbl[k].hp), hpShare: pct(tbl[k].hp, dmgAudit.hp) + '%' };
                    return o;
                };
                return {
                    runs: dmgAudit.runs || 0, events: dmgAudit.n, hpLost: Math.round(dmgAudit.hp),
                    byClass: shape(dmgAudit.cls),
                    sole: shape(dmgAudit.sole),
                    unattributed: {
                        n: dmgAudit.none.n, hp: Math.round(dmgAudit.none.hp),
                        eventShare: pct(dmgAudit.none.n, dmgAudit.n) + '%',
                        hpShare: pct(dmgAudit.none.hp, dmgAudit.hp) + '%',
                        bossD: bd.length ? { p25: q(bd, 0.25), median: q(bd, 0.5), p75: q(bd, 0.75) } : null,
                        near: nr.length ? { p25: q(nr, 0.25), median: q(nr, 0.5), p75: q(nr, 0.75) } : null
                    },
                    note: '`sole` is ground truth. A large `unattributed` share means the classifier is booking unknown damage as contact.'
                };
            };
            window.pineBot.damageEvents = () => dmgAudit.ev.slice();
            // v6.85.22: the learned per-type threat multipliers and the raw
            // per-type damage attribution behind them.
            window.pineBot.enemyThreat = () => ({
                learnedMul: Object.assign({}, (learn && learn.enemyTypeMul) || {}),
                damageByType: Object.assign({}, dmgAudit.byType || {})
            });
            // v6.89.7: pineBot.incomeAudit() — the arithmetic of deep survival.
            // Contact damage is rate-limited near 40 dps by the 33-frame invuln,
            // and past the speed crossover positioning cannot move that much.
            // So what decides a deep run is whether heal income clears the
            // floor. Each row is a 10-minute slice of gameTime: `lossPerSec`
            // against `gainPerSec`, with `net` the number that matters. Rows
            // with little `dtS` are noise — read `dtS` before reading `net`.
            window.pineBot.incomeAudit = () => {
                const rows = Object.keys(incAudit.buckets)
                    .map(Number).sort((a, b) => a - b)
                    .map(k => {
                        const b = incAudit.buckets[k];
                        const per = x => b.dtS > 0 ? +(x / b.dtS).toFixed(2) : null;
                        return {
                            fromMin: Math.round(k / 60), dtS: Math.round(b.dtS),
                            lossPerSec: per(b.lossHp), gainPerSec: per(b.gainHp),
                            net: b.dtS > 0 ? +((b.gainHp - b.lossHp) / b.dtS).toFixed(2) : null,
                            events: { loss: b.lossN, gain: b.gainN },
                            spikes: b.spikeN ? { n: b.spikeN, hp: Math.round(b.spikeHp) } : null
                        };
                    });
                const deep = rows.filter(r => r.fromMin >= 20 && r.dtS >= 60);
                return {
                    runs: incAudit.runs || 0, buckets: rows,
                    firstNegativeMin: (deep.find(r => r.net != null && r.net < 0) || {}).fromMin ?? null,
                    note: 'net < 0 means the pool is draining at that depth: no posture fixes that, only heal income or time-stop uptime. Ignore rows with dtS under ~60. `spikes` are level-up maxHp raises and revives, excluded from gainPerSec.'
                };
            };
            // v6.91.1: pineBot.huntAudit() — does the dormant/frozen-boss hunt
            // actually damage anything? The one boss measured live had 6.03e9
            // hp. If `dmg` stays at 0 across a few dozen attempts the hunt is a
            // walk to the edge that accomplishes nothing.
            window.pineBot.huntAudit = () => {
                const a = huntAudit || {};
                const n = a.attempts || 0;
                return {
                    runs: a.runs || 0, attempts: n, frozenAttempts: a.frozenAttempts || 0,
                    secsTotal: Math.round(a.secs || 0),
                    secsPerAttempt: n ? +((a.secs || 0) / n).toFixed(1) : null,
                    dmgTotal: Math.round(a.dmg || 0),
                    dmgPerAttempt: n ? Math.round((a.dmg || 0) / n) : null,
                    best: Math.round(a.best || 0),
                    vanished: a.vanished || 0,
                    note: 'dmg is the target boss hp lost while the bot held the post. `vanished` = the id left the enemy list (a kill OR a despawn — indistinguishable here). dmgTotal 0 over 20+ attempts means the hunt should become a warning posture, not a trip.'
                };
            };
            window.pineBot.resetHuntAudit = () => {
                huntAudit = { attempts: 0, frozenAttempts: 0, dmg: 0, best: 0, vanished: 0, secs: 0, runs: 0 };
                huntMark = null;
                try { localStorage.removeItem(HUNT_AUDIT_KEY); } catch (e) { }
                return 'hunt audit cleared';
            };
            // v6.91.3: pineBot.markAudit() — does the corner actually clear the
            // marks? `worstMargin` is the closest a mark edge ever came to the
            // seat; negative means it covered it. `rMax` climbing with depth
            // would mean the 80.92px geometry lapses and the corner is the wrong
            // answer to marks at depth.
            window.pineBot.markAudit = () => {
                const rows = Object.keys(markAudit.buckets || {}).map(Number).sort((a, b) => a - b).map(k => {
                    const b = markAudit.buckets[k];
                    return {
                        fromMin: Math.round(k / 60), n: b.n,
                        rAvg: b.n ? +(b.rSum / b.n).toFixed(1) : null,
                        rMin: b.rMin == null ? null : +b.rMin.toFixed(1),
                        rMax: b.rMax == null ? null : +b.rMax.toFixed(1),
                        worstMargin: b.worstMargin == null ? null : +b.worstMargin.toFixed(1),
                        coveredSeat: b.covers
                    };
                });
                return {
                    runs: markAudit.runs || 0, buckets: rows,
                    seatGeometry: 'true corner (0,0) is 80.92px from the nearest spawnable mark centre (52,62); the seat used before 6.91.3 was (p.r,p.r) = 70.78px, and its 12px fallback was 64.03 — inside a 70px mark.',
                    note: 'worstMargin <= 0 in any bucket means the corner is NOT mark-immune at that depth. rMax rising across buckets means mark radius scales with time, which would retire the corner as the answer to marks.'
                };
            };
            // v6.91.4: pineBot.pauseAudit() — is the field ever actually stopped?
            // The WHISKY SOUR tilt assumes TIME STOP is scarce. If `share` comes
            // back high, that assumption is wrong and the tilt should go.
            window.pineBot.pauseAudit = () => {
                const a = pauseAudit || {};
                const h = a.hellTicks || 0;
                return {
                    runs: a.runs || 0, hellTicks: h, pauseTicks: a.pauseTicks || 0,
                    share: h ? +((a.pauseTicks || 0) / h).toFixed(3) : null,
                    thisRun: (() => { const s = pauseShareRun(); return s == null ? null : +s.toFixed(3); })(),
                    note: 'share = fraction of hell planner ticks with the field stopped (WHISKY SOUR per-enemy freeze OR a TIME STOP pickup). A high share means freezes are plentiful and the WHISKY SOUR keyless slot is redundant; a low one is the premise it was added on.'
                };
            };
            window.pineBot.resetPauseAudit = () => {
                pauseAudit = { runs: 0, hellTicks: 0, pauseTicks: 0 };
                runHellTicks = 0; runPauseTicks = 0;
                try { localStorage.removeItem(PAUSE_AUDIT_KEY); } catch (e) { }
                return 'pause audit cleared';
            };
            // v6.91.8: pineBot.parkAudit() — the 10% vs the 90%.
            // 6.91.6 showed a BIMODAL distribution: nothing between 26 and 124
            // minutes. A run either reaches the seat or dies at the entrance, so
            // the only lever left is P(reach the seat). This compares the build
            // AT THE ENTRANCE for runs that got seated against runs that did not.
            window.pineBot.parkAudit = () => {
                const rs = (parkAudit && parkAudit.runs) || [];
                const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y);
                    return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
                const grp = (list, label) => ({
                    group: label, n: list.length,
                    medianTimeS: med(list.map(r => r.t)),
                    medianEntryDef: med(list.filter(r => r.entry).map(r => r.entry.def)),
                    medianEntryRegen: med(list.filter(r => r.entry).map(r => r.entry.regen)),
                    medianEntrySupers: med(list.filter(r => r.entry).map(r => r.entry.supers)),
                    zonerShare: list.length ? +(list.filter(r => r.entry && r.entry.zoner).length / list.length).toFixed(2) : null
                });
                const seated = rs.filter(r => r.first != null);
                const never = rs.filter(r => r.first == null);
                return {
                    hellRuns: rs.length,
                    reachedSeat: seated.length,
                    reachRate: rs.length ? +(seated.length / rs.length).toFixed(2) : null,
                    medianFirstParkS: med(seated.map(r => r.first)),
                    medianSeatShare: med(seated.map(r => Math.round((r.seatShare || 0) * 100))),
                    groups: [grp(seated, 'REACHED THE SEAT'), grp(never, 'NEVER PARKED')],
                    note: 'parkArmor needs defense >= deepHell.parkDefense (30, about 5.15 OLIVE-equivalents) and regen >= parkRegenRate (1.0), plus SOUTH SIDE. If medianEntryDef is far below 30 in the NEVER group and at/above it in the SEATED group, the entrance build IS the lever and the fix is upstream in the picker, not in the posture.'
                };
            };
            window.pineBot.resetParkAudit = () => {
                parkAudit = { runs: [] };
                try { localStorage.removeItem(PARK_AUDIT_KEY); } catch (e) { }
                return 'park audit cleared';
            };
            window.pineBot.resetMarkAudit = () => {
                markAudit = { buckets: {}, runs: 0 };
                try { localStorage.removeItem(MARK_AUDIT_KEY); } catch (e) { }
                return 'mark audit cleared';
            };
            window.pineBot.resetIncomeAudit = () => {
                incAudit = { buckets: {}, runs: 0 };
                incCursor.t = null; incCursor.hp = null;
                try { localStorage.removeItem(INC_AUDIT_KEY); } catch (e) { }
                return 'income audit cleared';
            };
            window.pineBot.resetDamageAudit = () => {
                dmgAudit = { n: 0, hp: 0, cls: {}, sole: {}, none: { n: 0, hp: 0, bossD: [], near: [] }, ev: [], runs: 0 };
                try { localStorage.removeItem(DMG_AUDIT_KEY); } catch (e) { }
                return 'damage audit cleared';
            };
            window.pineBotDiagnose = diagnose;
            window.pineBotStats = buildStatsReport;
        } catch (e) { log('BOOT API FAILED: ' + (e && e.message)); }   // v6.87.3: was a silent catch; a missing hook cost an hour
        if (CONFIG.autoStart) setTimeout(startBot, 900);
        // v6.83.1: end-to-end release test — no behaviour change. If this line
        // shows in the console after a self-update, the whole pipeline works.
        log('v' + scriptTag() + ' loaded (scoring profile: ' + CONFIG.scoringProfile + '). window.pineBot available — pineBot.compare() for the version table.');
        log('release pipeline check: 6.83.2 arrived via Violentmonkey AUTO-UPDATE ✔');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

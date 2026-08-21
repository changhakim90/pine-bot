
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
        if (A.dashEnabled && hasGame('tryDash') && now - lastDash > dashGate &&
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
        const harvest = !plan.hpPanic && ((plan.passoutsNear || 0) >= 3 ||
            ((plan.passoutsNear || 0) >= 1 && (plan.poCentroidDist == null || plan.poCentroidDist < 80)));
        // USER DOCTRINE: an available ultimate is SPENT on the high-loot
        // targets — NO BOOKING walls (42x hp: the ult burst breaks the
        // siege open), bosses in range, and passout clusters. Damage +
        // invincibility, and the loot funds the build.
        // MINGUK ULT DOCTRINE (user): the ultimate is the roaming-boss and
        // passout killer — any of them in range is reason enough to fire.
        const lootTargets = !plan.hpPanic &&
            (plan.wallNear === true || plan.bossNear === true || (plan.passoutsNear || 0) >= 1 ||
             plan.roamingBoss === true);
        const linebackerBurst = !plan.hpPanic && (plan.lines || 0) > 0 && plan.boss === true;   // charging linebacker: ult damage + invincibility
        // USER: when mob HP scales past what five supers can kill, the ult
        // becomes the regular clear tool — fire on cooldown into any group.
        const scalingMobs = (plan.toughness || 0) > 2 && plan.near >= 2 && !plan.hpPanic;
        // DEEP RUN (user): past ~80 minutes, or any time flight mode is on,
        // the ult goes off on cooldown — killing is how a TIME STOP drops,
        // and the invincibility window is free survival either way.
        const gtDeep = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const ultSpam = !plan.hpPanic && (plan.flight === true || (hellDetected && gtDeep > 4800));
        // DEEP HELL (v6.82.0): a body about to land on us at depth is the
        // hit that ends 68% of runs — if the ult is up, its invincibility
        // window is worth more than any harvest it was being saved for.
        const contactSave = CONFIG.deepHell.ultOnContact && plan.contactImminent === true && (plan.depth || 0) > 0;
        // FIRST-20-MINUTES AGGRESSION (user): during the funding phase the
        // ult is retried at double cadence — every passout cleared early is
        // loot, XP, and upgrade potential compounding for the whole run.
        const gtU = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const ultGate = (gtU < 1200 && !hellDetected) ? A.ultCooldownMs * 0.6 : A.ultCooldownMs;
        if (A.ultEnabled && hasGame('useUltimate') && now - lastUlt > ultGate &&
            (plan.near >= A.ultCrowd || plan.hpRatio < A.ultHpRatio ||
                defensive || offensive || emergency || entryHold || surgeCrowd || harvest || lootTargets || linebackerBurst || scalingMobs || ultSpam || contactSave)) {
            lastUlt = now;
            callGame('useUltimate');
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
            '<button id="pbRec" style="cursor:pointer" title="Record YOUR manual play as a teaching demo (stop the bot first)">🎥</button>' +
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
            infoEl.innerHTML =
                'tab: ' + TAB_ID + '   runs(all tabs): ' + learn.runs +
                (vs && vs.n ? '   this ver: ' + vs.n + ' runs, best ' + Math.round(vs.bestT / 60) + 'm' : '') + '<br>' +
                (hidden ? '<b style="color:#f88">⚠ background tab — game frozen by the browser; keep this window visible</b><br>' : '') +
                'state: <b style="color:#ffd98a">' + (st == null ? '(unreadable)' : st) + '</b><br>' +
                'move: ' + moveSource + '<br>' +
                'build: ' + (primaryCocktail || '—') + '<br>' +
                'picks: ' + runPicks.length + '<br>' +
                'model: CEM g' + learn.cem.gen + ' (' + learn.cem.batch.length + '/' + CONFIG.learning.batchSize + ')' +
                (championRun ? ' 👑' : '') +
                (lastDeathCause ? '   died→' + lastDeathCause : '') +
                (learn.hof.length ? '   best ' + learn.hof[0].r.toFixed(2) : '') +
                (learn.genHistory.length >= 2
                    ? (learn.genHistory[learn.genHistory.length - 1] > learn.genHistory[learn.genHistory.length - 2] ? ' ↑' : ' ↓')
                    : '') + '<br>' +
                (p ? p.diag + '<br>' : '') +
                'last: ' + String(lastAction).slice(0, 34);
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
                hallOfFame: learn.hof.map(h => +h.r.toFixed(3)),
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
        } catch (e) { setStatus('demo save failed: ' + e.message); }
        demoRec = null;
    }
    function demoTick() {
        if (!demoRec) return;
        const p = G.player; if (!p || G.state !== 'playing') return;
        const en = Array.isArray(G.enemies) ? G.enemies.filter(Boolean) : [];
        const fr = safe(() => frame, 0) || 0;
        let poD = null, bossD = null, wallD = null, near = 0;
        let frozenBossD = null, frozenN = 0, hpSum = 0, hpN = 0;
        for (const e of en) {
            const dd = Math.hypot(e.x - p.x, e.y - p.y);
            const ty = String(e.type), bc = String(e.bossChar || '');
            const froz = typeof e.frozenUntil === 'number' && e.frozenUntil > fr;
            if (froz) frozenN++;
            if (ty === 'passout') { if (poD == null || dd < poD) poD = Math.round(dd); continue; }
            if (/nobook/i.test(bc + ty)) { if (wallD == null || dd < wallD) wallD = Math.round(dd); }
            else if (ty === 'boss') {
                if (bossD == null || dd < bossD) bossD = Math.round(dd);
                // STALL DOCTRINE: how close does the user get to a PAUSED boss?
                if (froz && (frozenBossD == null || dd < frozenBossD)) frozenBossD = Math.round(dd);
            }
            if (typeof e.hp === 'number' && ty !== 'boss' && ty !== 'passout') { hpSum += e.hp; hpN++; }
            if (dd < 90) near++;
        }
        demoRec.samples.push({
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
            fx: typeof p.fireCrossUntil === 'number' && p.fireCrossUntil > fr ? 1 : 0
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
                    activeRoster: () => activeRoster,
                    bossRing: () => bossRingRef.v,
                    // test-only: age the hell-entry stamp so the 90s entry
                    // window (`hellRecent`) is past and the boss-ring branch
                    // is reachable without sleeping for a minute and a half.
                    ageHellEntry: ms => { if (hellEnteredAt) hellEnteredAt -= (ms || 120000); },
                    applyDefaults: () => applyParams(DEFAULT_PARAMS),
                    reloadLearn: () => { learn = loadLearn(); }
                }
            };
            window.pineBotDiagnose = diagnose;
            window.pineBotStats = buildStatsReport;
        } catch (e) { }
        if (CONFIG.autoStart) setTimeout(startBot, 900);
        // v6.83.1: end-to-end release test — no behaviour change. If this line
        // shows in the console after a self-update, the whole pipeline works.
        log('v' + scriptTag() + ' loaded (scoring profile: ' + CONFIG.scoringProfile + '). window.pineBot available — pineBot.compare() for the version table.');
        log('release pipeline check: 6.83.2 arrived via Violentmonkey AUTO-UPDATE ✔');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

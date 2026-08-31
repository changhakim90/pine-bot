
    // =================================================================
    // RUN LIFECYCLE + STATS
    // =================================================================
    function snapshotStats() {
        const t = G.gameTime, k = G.killCount, m = G.money;
        return {
            time: typeof t === 'number' ? t : (runStart ? (Date.now() - runStart) / 1000 : null),
            downs: typeof k === 'number' ? k : null,
            sales: typeof m === 'number' ? m : null
        };
    }

    function parseResultScreen() {
        const text = bodyText();
        const out = { time: null, downs: null, sales: null };
        let m = text.match(/TIME\s*SURVIVED[^\d]*(?:(\d+):)?(\d+):(\d{2})/i);
        if (m) out.time = (m[1] ? +m[1] : 0) * 3600 + (+m[2]) * 60 + (+m[3]);
        m = text.match(/CUSTOMERS\s*DOWNED[^\d]*([\d,]+)/i);
        if (m) out.downs = +m[1].replace(/,/g, '');
        m = text.match(/TODAY['’]?S\s*SALES[^\d]*([\d,]+)/i);
        if (m) out.sales = +m[1].replace(/,/g, '');
        return out;
    }

    // The unbounded half of the reward. Kept separate so it can be asserted
    // directly: strictly increasing in time, with NO ceiling at any horizon.
    function hellTimeBonus(timeS) {
        const ms = CONFIG.milestones;
        const t = Math.max(0, timeS || 0);
        const depth = ms.hellDepth * Math.log2(1 + Math.max(0, (t - 1200) / 1800));
        // v6.91.6: a FIXED reference, not the live crown. See milestones.crownRefS.
        const ref = ms.crownRefS || 15150;
        return depth + ms.crownProgress * (t / ref);
    }

    function computeReward(stats) {
        const n = CONFIG.normalize, w = CONFIG.scoring, ms = CONFIG.milestones;
        const t = Math.min(1.6, (stats.time || 0) / n.time);
        const d = Math.min(1.6, (stats.downs || 0) / n.downs);
        const s = Math.min(1.6, (stats.sales || 0) / n.sales);
        let r = w.time * t + w.downs * d + w.sales * s;
        // Milestone shaping: the optimizer climbs toward the ACTUAL goals —
        // supers unlocked, crafts made, day survived, hell entered, rainbow.
        r += ms.superUnlock * supersThisRun;
        r += ms.craft * craftsThisRun;
        if (dayClearedThisRun) r += ms.dayCleared;
        if (hellRunEnded) {
            r += ms.hellEntered;
            // ── THE SATURATION BUG (found v6.79.0, fixed here) ───────────────
            // Every term above is capped. t/d/s cap at 1.6 (t saturates at just
            // 24 min) and the old deep-hell term was
            //     ms.hellDepth * Math.min(3, (time - 1200) / 1800)
            // which pins at time = 1200 + 3*1800 = 6600s = 110 MINUTES.
            // Past 110 minutes the optimizer received EXACTLY ZERO gradient:
            // the 252:30 crown run scored 3.34 while a 115-minute run scored
            // 3.39, purely because it made one more craft. CEM was therefore
            // blind to every improvement in the half of the run that decides
            // the crown. Two replacements, both unbounded:
            //   1. log2 depth — diminishing but never flat.
            //   2. crown progress — LINEAR in survival time, measured against
            //      the live crown, so the single thing we are optimising for
            //      produces gradient at every second of the run.
            r += hellTimeBonus(stats.time || 0);
        }
        if (rainbowThisRun) r += ms.rainbow;
        // v6.108.0: a PROVEN cap is a milestone, not a truncation. capEarly
        // means the stability proof or the saturation detector fired — the
        // run demonstrated it could not be killed. A bare runCapS timeout is
        // excluded on purpose: reaching a clock proves nothing about a build.
        if (capEarly && ms.immortal) r += ms.immortal;
        return r;
    }

    function startRun() {
        runActive = true;
        resetPoTracking();   // v6.86.2: passout kill-rate evidence is per run
        runStart = Date.now();
        runPicks = [];
        runPickCounts = {};
        primaryCocktail = null;
        ownedLevels = {};
        ownedMax = {};
        everMaxed = new Set();
        lastPoolSig = null;
        lastPoolRef = null;
        levelupStuckAt = 0;
        hellDetected = pendingHellEntry;   // we took the hell entrance — this run IS hell
        hellEnteredAt = pendingHellEntry ? gameMs() : 0;
        pendingHellEntry = false;
        deathSnapshot = null;
        dangerAccum = { contact: 0, proj: 0, mark: 0, line: 0, rival: 0 };
        lastHpSample = null;
        lastMarkSnap = [];
        huntStartS = null; huntRestUntilS = 0;   // v6.91.0: the hunt budget is per-run
        harvStartS = null; harvRestUntilS = 0;   // v6.93.1: so is the harvest-approach clock
        trekStartS = null; trekRestUntilS = 0;   // v6.94.0: and the day-trek clock
        parkYieldId = null; parkYieldAt = 0;     // v6.91.4
        parkFirstS = null; parkOnTicks = 0; parkedTicks = 0; entrySample = null;   // v6.91.8
        // v6.96.2 phase audit: a run that BEGINS in hell (the results-screen
        // hell entrance) entered at gt 0; otherwise the latch time is
        // recorded lazily by the first gather that sees hellDetected.
        hellEnterGt = hellDetected ? 0 : null;
        capFiredThisRun = false;
        capWpIdx = 0; capWpUntil = 0;   // v6.96.2: the cap patrol restarts its circuit
        capStableSince = null; capEarly = false;   // v6.99.3: the stability proof is per-run
        capFirstGt = null;                          // v6.99.4: capAt telemetry is per-run
        capDipSince = null; capBestStreakS = 0; capLastResetReason = null;   // v6.100.1: dip-grace state is per-run
        capHurtAt = 0; capForcedThisRun = false;   // v6.101.0: the cap ladder's actuator state is per-run
        capReadyGt = null;                         // v6.102.0: build-complete gt is per-run
        capFirstWall = 0; satSince = null; satPeakEn = 0;   // v6.108.0: wall stamp + saturation state are per-run
        spdLastGt = null; spdLastWall = 0; spdSamples = []; spdWorst = null;   // v6.108.0: speed telemetry is per-run
        invulnTicks = 0; planTicks = 0; ultMaxLv = 0; ultLv6At = null;   // v6.109.0: ult-uptime economy is per-run
        invulnAllTicks = 0; ultCasts = 0; ultLastReadyAt = null; ultCdMulSeen = null;   // v6.111.0
        laneInTicks = 0; laneEscTicks = 0;   // v6.111.0: lane exposure and escapes are per-run
        runHellTicks = 0; runPauseTicks = 0;     // v6.91.4: pause uptime is per-run
        enemyMix = { swarm: 0, ranged: 0, bomber: 0, boss: 0, total: 0 };
        computeRoadmap();   // the plan itself learns: re-derive from live build stats
        AVOID_INGREDIENTS = new Set(AVOID_INGREDIENTS_BASE);   // day rules until hell is latched
        hellUnbanApplied = false;
        if (hellDetected) applyHellUnban();
        killRate = 0; lastKillCount = null; lastKillAt = 0;
        dropAnchorTicks = 0; dropAnchorLastGt = 0;   // v6.107.0: anchor telemetry is per-run
        pressureAvg = 0; toughnessAvg = 1; dpsDeficit = 0; passoutAvg = 0;
        supersThisRun = 0; craftsThisRun = 0; rainbowThisRun = false; dayClearedThisRun = false;
        rainbowAt = 0;
        rainbowChoice = null;
        lastLevelUpAt = gameMs();
        supersMade = new Set();
        runPickCtx = [];
        beginTrial();
        log('run started; roster', activeRoster, '| CEM gen', learn.cem.gen, 'batch', learn.cem.batch.length + '/' + CONFIG.learning.batchSize, 'tab', TAB_ID);
    }

    // v6.96.2 PHASE CLASSIFICATION (user: "get the data of how it survived
    // day mode and hell and deep hell mode"). A run's phase is where it
    // ENDED, judged on hellRunEnded (captured before the results screen can
    // mutate the live flag) and the game-time the latch was seen:
    //   day   — hell never latched; the run died in the funding phase.
    //   entry — hell latched and death came within phaseAudit.entryS seconds
    //           of the latch: the entry surge, the window the seat bridges.
    //   hell  — past the entry window but before phaseAudit.deepFromS.
    //   deep  — past deepFromS: the parked-equilibrium regime. A cap-out
    //           books here with cap:true, so the row is legible as
    //           right-censored rather than as a natural death.
    function buildPhaseRow(t, hellEnded) {
        const PA = CONFIG.phaseAudit || {};
        const entryS = PA.entryS != null ? PA.entryS : 300;
        const deepFromS = PA.deepFromS != null ? PA.deepFromS : 7200;
        const ph = !hellEnded ? 'day'
            : (hellEnterGt != null && (t - hellEnterGt) < entryS) ? 'entry'
            : t < deepFromS ? 'hell' : 'deep';
        return {
            v: scriptTag(), t, ph,
            cause: lastDeathCause,
            hEnt: hellEnterGt == null ? null : Math.round(hellEnterGt),
            sup: supersThisRun,
            day: !!dayClearedThisRun,
            seat: entrySample ? !!entrySample.seated : null,
            def: entrySample ? entrySample.def : null,
            regen: entrySample ? entrySample.regen : null,
            ultLv: entrySample ? (entrySample.ultLv || 0) : null,
            cap: !!capFiredThisRun,
            // v6.99.4: gt at first patrol engage. capAt < runCapS = the
            // EARLY stability proof fired; capAt >= runCapS = the clock.
            capAt: capFirstGt == null ? null : Math.round(capFirstGt),
            // v6.102.0: gt the build met armour+supers. Answers "when is a
            // build actually complete?" across runs, cap-out or not.
            readyAt: capReadyGt == null ? null : Math.round(capReadyGt),
            // v6.108.0 THE STALL SIGNATURE, on every row. A probe of the run
            // that would not end measured 0.021 game-seconds per wall-second
            // with enemies pinned at 260 and HP flat. None of that was
            // visible in any audit — this makes it visible without a probe.
            //   spd  = median game-sec per wall-sec (1.0 = healthy page)
            //   spdLo= worst sample of the run
            //   enMax= peak live enemy count (the entity cap is ~260)
            //   why  = what armed the cap: 'saturated' names the new arm
            spd: (() => { if (!spdSamples.length) return null;
                const a = spdSamples.slice().sort((x, y) => x - y);
                return a[Math.floor(a.length / 2)]; })(),
            spdLo: spdWorst,
            enMax: satPeakEn || null,
            why: capFiredThisRun ? (capLastResetReason || null) : null,
            // v6.109.0 THE ULT-UPTIME ECONOMY, with v6.111.0's correction.
            //
            // 6.109.0 shipped `inv` so it could be compared against the manual
            // joe demo's 0.326. It should not have been: the demo's number ORs
            // in `player.invuln` (the 38-frame post-hit window) and `inv` does
            // not, so the "3.9x ult-uptime gap" read off that comparison at
            // n=1250 was a units error. Joe's ult ceiling is 8/80 = 10% at lv1
            // and 12/80 = 15% at lv6; a measured median of 0.103 is a bot
            // already firing near cooldown, not one hoarding its ult.
            //
            //   inv    = ULT invulnerability only        <- compare to nothing
            //   invAll = ult windows OR hit frames       <- compare to demo `invulnShare`
            //   casts  = ACCEPTED casts (ultReadyAt moved), not button presses
            //   cdMul  = observed player.ultCdMul — the real lever on uptime
            //   ultMax = highest ult level reached (lv6 wipes fields; lv1-3 chip)
            //   ult6At = gt the ult was maxed, null if never
            //   laneIn/laneEsc = ticks inside a live lane band, and ticks the
            //     v6.111.0 perpendicular override actually steered
            inv: planTicks ? +(invulnTicks / planTicks).toFixed(3) : null,
            invAll: planTicks ? +(invulnAllTicks / planTicks).toFixed(3) : null,
            casts: ultCasts || 0,
            cdMul: ultCdMulSeen == null ? null : +ultCdMulSeen.toFixed(3),
            ultMax: ultMaxLv || null,
            ult6At: ultLv6At == null ? null : Math.round(ultLv6At),
            laneIn: laneInTicks || 0,
            laneEsc: laneEscTicks || 0
        };
    }

    // v6.97.2 MULTI-TAB AUDIT APPEND (user runs 2+ game tabs). The learn
    // store merges across tabs (finishRun re-loads before crediting), but
    // the ROW-LIST audits never did: each tab kept its own in-memory array
    // and wrote the WHOLE object, so parallel tabs clobbered each other's
    // rows — measured: 266 runs since the store reset, 58 phase rows kept
    // (~22%, consistent with 4-5 tabs). Every append now re-reads the
    // stored list first, so this tab's new row lands on top of whatever
    // every other tab has written since our boot. The race window is one
    // synchronous read-modify-write — two tabs finishing in the same
    // millisecond can still lose one row, which is noise; losing 78% was
    // not. Returns the merged object so the caller adopts the shared view.
    function appendAuditRow(key, obj, field, row, keep) {
        try {
            const cur = JSON.parse(localStorage.getItem(key) || 'null');
            if (cur && Array.isArray(cur[field])) obj[field] = cur[field];
        } catch (e) { }
        obj[field] = obj[field] || [];
        obj[field].push(row);
        while (obj[field].length > keep) obj[field].shift();
        localStorage.setItem(key, JSON.stringify(obj));
        return obj;
    }

    function finishRun() {
        if (!runActive) return;
        runActive = false;
        // Capture hell status NOW, before any hell-entrance click on the
        // results screen can mutate the live flag and fake a hell record.
        hellRunEnded = hellDetected;

        // MULTI-TAB: merge in every other tab's progress before crediting this
        // run, then save — so parallel tabs accumulate into one shared pool
        // instead of overwriting each other.
        learn = loadLearn();

        const parsed = parseResultScreen();
        const snap = deathSnapshot || snapshotStats();
        const stats = {
            time: parsed.time ?? snap.time ?? 0,
            downs: parsed.downs ?? snap.downs ?? 0,
            sales: parsed.sales ?? snap.sales ?? 0
        };
        lastRunStats = stats;

        const reward = computeReward(stats);
        const base = baseline();
        creditItems(reward);
        creditLinUcb(reward);
        creditTagUcb(reward);   // v6.107.0: the same run also teaches the attack-type layer
        if (primaryCocktail) {
            const b = learn.builds[primaryCocktail] || { n: 0, sum: 0 };
            b.n = b.n * CONFIG.learning.decay + 1;
            b.sum = b.sum * CONFIG.learning.decay + reward;
            learn.builds[primaryCocktail] = b;
        }
        // MEASURED SPAWN TIMETABLE: fold this run's first-appearance times
        // into the shared intel (only runs long enough to be informative).
        for (const [k, gt] of Object.entries(seenTypesThisRun)) {
            if (gt > 5) {   // ignore instant spawns (basic mobs at t=0)
                const si = learn.spawnIntel[k] || { n: 0, sum: 0 };
                si.n = si.n * CONFIG.learning.decay + 1;
                si.sum = si.sum * CONFIG.learning.decay + gt;
                learn.spawnIntel[k] = si;
            }
        }
        // RAINBOW POLICY: if this run faced the take-vs-skip decision,
        // credit the arm it played so the crown-path bandit learns.
        if (rainbowChoice) {
            const rp = learn.rainbowPolicy[rainbowChoice] || { n: 0, sum: 0 };
            rp.n = rp.n * CONFIG.learning.decay + 1;
            rp.sum = rp.sum * CONFIG.learning.decay + reward;
            learn.rainbowPolicy[rainbowChoice] = rp;
        }
        // ROSTER EXPERIMENT: credit this run's reward to the roster it played,
        // so chooseRoster's explore/exploit has real evidence to compare.
        if (activeRoster) {
            const rs = learn.rosters[activeRoster] || { n: 0, sum: 0 };
            rs.n = rs.n * CONFIG.learning.decay + 1;
            rs.sum = rs.sum * CONFIG.learning.decay + reward;
            learn.rosters[activeRoster] = rs;
        }
        // dominant recent hazard = probable cause of death
        lastDeathCause = null;
        let dmax = 0.5;
        for (const k of Object.keys(dangerAccum)) {
            if (dangerAccum[k] > dmax) { dmax = dangerAccum[k]; lastDeathCause = k; }
        }
        // v6.85.22: learned per-type threat multiplier. Each type's share of
        // this run's attributed HP loss pulls its multiplier toward
        // 1 + 3*share (EMA, clamped 0.6-2.2); types that did nothing drift
        // back toward 1. gatherThreats multiplies the static profile weight
        // by this, so the danger field fears what has actually been hurting
        // THIS bartender, learned across runs.
        try {
            const totalHit = Object.values(hitTypeRun).reduce((a, b) => a + b, 0);
            if (totalHit > 0) {
                const mul = learn.enemyTypeMul || (learn.enemyTypeMul = {});
                const cnt = learn.enemyTypeN || (learn.enemyTypeN = {});
                for (const k of Object.keys(hitTypeRun)) {
                    const share = hitTypeRun[k] / totalHit;
                    // v6.107.0: TARGET NARROWED 1+3*share -> 1+1.2*share.
                    // The old target let a type that took most of one run's
                    // contact damage aim at 4.0 and sit against the 2.2 clamp
                    // permanently; a clamp that is the resting state is not a
                    // clamp. 1.2 puts a type that took ALL of a run's contact
                    // damage at 2.2 as its ASYMPTOTE, so the cap is reached
                    // only by a type that does it run after run.
                    const target = 1 + 1.2 * share;
                    mul[k] = Math.max(0.6, Math.min(2.2, 0.85 * (mul[k] || 1) + 0.15 * target));
                    cnt[k] = (cnt[k] || 0) + (hitTypeN[k] || 0);
                }
                for (const k of Object.keys(learn.enemyTypeMul)) {
                    if (!(k in hitTypeRun)) learn.enemyTypeMul[k] = 0.9 * learn.enemyTypeMul[k] + 0.1;
                }
            }
            hitTypeRun = {}; hitTypeN = {};
        } catch (e) { }
        // v6.85.13: persist the damage audit so a page reload does not lose it.
        // Written once per run, not per damage event — this is on the run-end
        // path, never in the frame loop. The event ring is trimmed hard because
        // the summary counters are what the analysis actually needs.
        try {
            dmgAudit.runs = (dmgAudit.runs || 0) + 1;
            dmgAudit.lastDeath = lastDeathCause;
            const slim = Object.assign({}, dmgAudit, { ev: dmgAudit.ev.slice(-120) });
            localStorage.setItem(DMG_AUDIT_KEY, JSON.stringify(slim));
        } catch (e) { }
        // v6.89.7: the income audit accumulates ACROSS runs — one run's deep
        // buckets hold only a few minutes of samples, and the balance at 90
        // minutes needs many runs before it means anything.
        try {
            incAudit.runs = (incAudit.runs || 0) + 1;
            localStorage.setItem(INC_AUDIT_KEY, JSON.stringify(incAudit));
        } catch (e) { }
        incCursor.t = null; incCursor.hp = null;   // next run starts a fresh integration
        // v6.91.1: close out any hunt still in flight when the run ended, then
        // count the run. Same cross-run accumulation as the income audit — a
        // single run rarely gets more than a couple of attempts.
        try {
            if (huntMark) { bookHunt(huntMark, 0); huntMark = null; }
            huntAudit.runs = (huntAudit.runs || 0) + 1;
            localStorage.setItem(HUNT_AUDIT_KEY, JSON.stringify(huntAudit));
        } catch (e) { }
        try {
            markAudit.runs = (markAudit.runs || 0) + 1;
            localStorage.setItem(MARK_AUDIT_KEY, JSON.stringify(markAudit));
        } catch (e) { }
        // v6.91.8: one record per HELL run — the build at the entrance, whether
        // the seat was ever reached, and how long the run lasted. Rolling window;
        // the question it answers is a comparison between two groups, not a total.
        try {
            if (hellRunEnded) {
                // v6.97.2: merge-on-write — see appendAuditRow.
                parkAudit = appendAuditRow(PARK_AUDIT_KEY, parkAudit, 'runs', {
                    t: Math.round(stats.time || 0),
                    first: parkFirstS,
                    onShare: runHellTicks ? +(parkOnTicks / runHellTicks).toFixed(3) : null,
                    seatShare: runHellTicks ? +(parkedTicks / runHellTicks).toFixed(3) : null,
                    entry: entrySample
                }, 80);
            }
        } catch (e) { }
        // v6.96.2 PHASE AUDIT: one row per run, EVERY run — parkAudit above
        // only sees hell runs, and joe's whole problem lives in the 82% that
        // die before it. See buildPhaseRow for the classification.
        try {
            // v6.97.2: merge-on-write — see appendAuditRow.
            phaseAudit = appendAuditRow(PHASE_AUDIT_KEY, phaseAudit, 'rows',
                buildPhaseRow(Math.round(stats.time || 0), hellRunEnded),
                (CONFIG.phaseAudit && CONFIG.phaseAudit.keep) || 240);
        } catch (e) { }
        try {
            if (runHellTicks > 0) {
                pauseAudit.runs = (pauseAudit.runs || 0) + 1;
                pauseAudit.hellTicks = (pauseAudit.hellTicks || 0) + runHellTicks;
                pauseAudit.pauseTicks = (pauseAudit.pauseTicks || 0) + runPauseTicks;
                localStorage.setItem(PAUSE_AUDIT_KEY, JSON.stringify(pauseAudit));
            }
        } catch (e) { }
        learn.history.push(reward);
        if (learn.history.length > 60) learn.history.shift();
        if (bartenderThisRun) {
            const atk = BARTENDER_TO_BASE_ATTACK[bartenderThisRun];
            const s = learn.items[atk] || { n: 0, sum: 0 };
            s.n += 1; s.sum += reward; learn.items[atk] = s; learn.totalPicks++;
        }
        // Run log for the 📊 stats report (shared across tabs like the rest).
        learn.runLog.push({
            t: Math.round(stats.time), d: stats.downs, s: stats.sales, r: +reward.toFixed(3),
            death: lastDeathCause, build: primaryCocktail,
            supers: supersThisRun, crafts: craftsThisRun,
            hell: hellRunEnded, day: dayClearedThisRun, rainbow: rainbowThisRun, rbp: rainbowChoice || undefined,
            gen: learn.cem.gen, champ: championRun, roster: activeRoster,
            v: scriptTag()
        });
        if (learn.runLog.length > 30) learn.runLog.shift();

        // PER-VERSION ROLLUP. runLog only keeps 30 entries, so version-vs-
        // version comparison needs its own durable accumulator. This is what
        // makes "which version performs best" an answerable question instead
        // of a reconstruction from memory. (v6.80.0: + downs/sales sums and
        // the version's TOP-N runs, so a frozen snapshot carries its best
        // runs with it.)
        {
            const vs = learn.versions[scriptTag()] || {
                n: 0, sumT: 0, bestT: 0, sumR: 0, sumD: 0, sumS: 0, hell: 0, day: 0,
                sumSupers: 0, deaths: {}, top: [], epoch: REWARD_EPOCH, firstRun: learn.runs
            };
            vs.n++;
            vs.sumT += stats.time || 0;
            vs.sumT2 = (vs.sumT2 || 0) + (stats.time || 0) * (stats.time || 0);
            if ((stats.time || 0) >= 3600) vs.over60 = (vs.over60 || 0) + 1;
            if ((stats.time || 0) >= 7200) vs.over120 = (vs.over120 || 0) + 1;
            vs.times = vs.times || [];
            vs.times.push(Math.round(stats.time || 0));
            while (vs.times.length > CONFIG.learning.versionTimesKeep) vs.times.shift();
            vs.bestT = Math.max(vs.bestT, stats.time || 0);
            vs.sumR += reward;
            vs.sumD = (vs.sumD || 0) + (stats.downs || 0);
            vs.sumS = (vs.sumS || 0) + (stats.sales || 0);
            vs.sumSupers += supersThisRun;
            if (hellRunEnded) vs.hell++;
            if (dayClearedThisRun) vs.day++;
            if (lastDeathCause) vs.deaths[lastDeathCause] = (vs.deaths[lastDeathCause] || 0) + 1;
            vs.lastRun = learn.runs;
            vs.top = vs.top || [];
            vs.top.push({
                run: learn.runs, t: Math.round(stats.time), d: stats.downs, s: stats.sales, r: +reward.toFixed(3),
                build: primaryCocktail, supers: supersThisRun, death: lastDeathCause,
                hell: hellRunEnded, champ: championRun, gen: learn.cem.gen
            });
            vs.top.sort((a, b) => b.t - a.t);   // ranked by the crown metric: survival time
            vs.top = vs.top.slice(0, CONFIG.learning.versionTopRuns);
            learn.versions[scriptTag()] = vs;
        }

        endTrial(reward);
        saveLearn();

        const verdict = base == null ? 'first recorded run'
            : reward > base ? `better than recent average (${reward.toFixed(3)} vs ${base.toFixed(3)})`
                : `below recent average (${reward.toFixed(3)} vs ${base.toFixed(3)})`;
        console.log('%c[PineBot] RUN END', 'font-weight:bold;color:#ffd98a',
            `\n  time ${Math.round(stats.time)}s   downs ${stats.downs}   sales ${stats.sales}` +
            `\n  reward ${reward.toFixed(3)} — ${verdict}` +
            `\n  version: ${scriptTag()}   roster: ${activeRoster || '(none)'}   build: ${primaryCocktail || '(none)'}` +
            `\n  picks: ${runPicks.join(', ') || '(none)'}` +
            `\n  milestones: supers ${supersThisRun}, crafts ${craftsThisRun}` +
            `${dayClearedThisRun ? ', DAY CLEARED' : ''}${hellRunEnded ? ', HELL' : ''}${rainbowThisRun ? ', RAINBOW!' : ''}` +
            `\n  died to: ${lastDeathCause || 'unknown'}` +
            `\n  final frame: ${lastPlan ? lastPlan.diag : 'n/a'}`);
        setStatus(`run over — ${Math.round(stats.time)}s / ${stats.downs} / ${stats.sales}`);
    }


    // =================================================================
    // v6.87.5 SECRET CRAFTS — the fusion prompt (SOURCE-READ, live DOM)
    // -----------------------------------------------------------------
    // openRecipe() states it outright: "SECRET CRAFTS · COMBINATIONS
    // (level the ingredients -> a fusion prompt appears mid-run)". The
    // prompt is a DOM overlay with `#craftBtn` ("MAKE BLACK VERMOUTH")
    // and `.craft-no` ("NOT NOW"). It does NOT change G.state, so the
    // `craft()` screen handler — which only runs when state === 'craft'
    // — never fired. And even when it did, its clickText regex was
    // /make it|craft|confirm|yes/, which does not match "MAKE BLACK
    // VERMOUTH". Two independent misses, and the cost was every craft
    // in every run: a live probe found sweetver lv6 + dryver lv6, an
    // EMPTY `player.absorbed`, and the prompt still sitting on screen.
    //
    // applyCraft() shows why that is expensive. The consumed materials
    // stay in player.weapons at full level — "능력치 효과는 계속 적용되고,
    // 슬롯 카운트에서만 빠짐 (3칸 -> 조합품 1칸)" — so the parts keep their
    // stat effect and only stop occupying slots. A craft is pure upside:
    // a free weapon plus slot relief on a bar the probe found holding 15.
    //
    // Never click NOT NOW: declining is strictly worse than any pick.
    function takeCraftPrompt() {
        try {
            // v6.88.0 AUDIT C1. The previous version incremented craftsThisRun
            // BEFORE clicking, did not check whether the click landed, and had
            // no dedupe — while handleScreens calls this every overlayMs (260ms)
            // for as long as the prompt is up. A prompt the game ignores was
            // therefore worth ~4 crafts per second: ten seconds booked 38, and
            // `milestones.craft * 38 = 1.90` is larger than the entire
            // time+downs+sales contribution to the reward. That number went
            // into cem.batch, the elites and the hall of fame, so the optimiser
            // converged on whichever vector happened to be playing while a
            // prompt was stuck. Now: latch on the prompt's identity, and only
            // COUNT the craft once the prompt is gone (proof the click worked).
            const yes = document.querySelector('#craftBtn, .craft-yes, .craft-ok');
            let target = (yes && visible(yes)) ? yes : null;
            let label = target ? (target.textContent || 'craft').trim() : '';
            if (!target) {
                for (const b of [...document.querySelectorAll('button, [onclick], .btn')]) {
                    const t = (b.textContent || '').trim();
                    if (!visible(b)) continue;
                    // v6.88.0 AUDIT S2-adjacent: the decline filter was English
                    // only while the accept side matched Korean anywhere in the
                    // label, so a Korean decline could be clicked. Both sides
                    // are now anchored and both languages are covered.
                    if (/^(not now|later|no thanks)\b/i.test(t)) continue;
                    if (/^(안\s*함|나중에|취소)/.test(t)) continue;
                    if (/^(make|combine|fuse)\b/i.test(t) || /^(조합|만들기)/.test(t)) { target = b; label = t; break; }
                }
            }
            if (!target) {
                // prompt gone: if we clicked one, THAT is when it counts
                if (craftPending) {
                    craftsThisRun++;
                    log('craft confirmed: ' + craftPending + ' (total ' + craftsThisRun + ')');
                    craftPending = null;
                }
                return false;
            }
            const sig = (target.id || '') + '|' + label.slice(0, 40);
            if (sig === craftPending) return true;   // already clicked THIS prompt — wait it out
            craftPending = sig;
            clickEl(target);
            setStatus('craft: ' + label.slice(0, 24));
            return true;
        } catch (e) { }
        return false;
    }

    // =================================================================
    // SCREEN AUTOMATION — driven by the game's own `state`
    // =================================================================
    function chooseBartender() {
        let b = null;
        if (CONFIG.preferredBartender && CHARS[CONFIG.preferredBartender]) b = CONFIG.preferredBartender;
        else if (Array.isArray(CONFIG.bartenderRotation) && CONFIG.bartenderRotation.length) b = nextRotationChar();
        if (!b) {
            let best = BARTENDERS[0], bestScore = -Infinity;
            for (const c of BARTENDERS) {
                const s = ucbScore(BARTENDER_TO_BASE_ATTACK[c]) + Math.random() * 0.05;
                if (s > bestScore) { bestScore = s; best = c; }
            }
            b = best;
        }
        // v6.85.0: switching bartender switches the learned store, the
        // posture profile and the version tag for everything that follows
        // (beginTrial reloads `learn` from the new key).
        if (b !== activeChar) { activeChar = b; learn = loadLearn(); log('bartender →', b, '| store', learnKey(), '| tag', scriptTag()); }
        return b;
    }

    function worldPickerVisible() {
        return [...document.querySelectorAll('.wb-play, .char, [onclick*="startGame"], [onclick*="selectWorldBartender"]')]
            .some(el => visible(el));
    }
    // Start the run with the bartender the rotation / preference / bandit
    // chose. startGame(charKey) takes the key directly (verified from its
    // source), so we call it ourselves instead of clicking the game's START
    // button, whose onclick carries whichever bartender the player last
    // highlighted. selectWorldBartender() is called first so the game's
    // own highlight/save state agrees with what we start.
    function startWithBartender() {
        const b = chooseBartender();
        bartenderThisRun = b;
        if (hasGame('selectWorldBartender')) safe(() => window.selectWorldBartender(b));
        if (hasGame('startGame')) { callGame('startGame', b); startRun(); return true; }
        const el = findByText(new RegExp('^' + b + '$', 'i'));
        if (el) { clickEl(el); startRun(); return true; }
        return false;
    }

    // Hell detection is latched ONLY while actually playing. The results
    // screen ("CLOSING TIME", leaderboard, enter-hell buttons) contains the
    // word HELL even after perfectly normal runs, so scanning it there
    // produced false stops. At game over we trust only the latched flag
    // and the game's own lexical flags — never the results-screen text.
    function hellLexicalFlag() {
        return safe(() => hell, undefined) === true ||
            safe(() => hellMode, undefined) === true ||
            safe(() => isHell, undefined) === true ||
            safe(() => inHell, undefined) === true;
    }
    function latchHellDuringPlay() {
        if (hellDetected) return;
        if (hellLexicalFlag()) { hellDetected = true; hellEnteredAt = gameMs(); log('HELL run latched (lexical flag)'); return; }
        if (CONFIG.hellModeRegex.test(bodyText())) { hellDetected = true; hellEnteredAt = gameMs(); log('HELL run latched (HUD text)'); }
    }

    function looksLikeNameEntry() {
        return [...document.querySelectorAll('input')].some(visible);
    }
    // v6.88.0 AUDIT S2: never press a control that sits on a form with a live
    // text input — that is the logbook name entry, and a bot entry in it is
    // exactly what the crown rules forbid.
    function notNameForm(el) {
        try {
            if (!el) return false;
            const idc = (el.id || '') + ' ' + (el.className || '');
            if (/save|submit|enter\s*name/i.test(idc)) return false;
            // No visible text input on screen: this is not the logbook.
            if (!looksLikeNameEntry()) return true;
            // A name form IS up. Refuse the SUBMIT vocabulary outright — an
            // ancestor walk is not enough, because the button is usually a
            // SIBLING of the input rather than its parent, and a flat layout
            // then reads as safe. Navigation labels stay allowed, because
            // leaving the screen is exactly what the bot needs to do here.
            const t = (el.textContent || '').trim();
            if (/^(ok|okay|confirm|yes|submit|save|done|enter|register|기록|확인|저장)\b/i.test(t)) return false;
            let n = el, hops = 0;
            while (n && hops++ < 4) {
                if (n.querySelectorAll && [...n.querySelectorAll('input')].some(visible)) return false;
                n = n.parentElement;
            }
        } catch (e) { }
        return true;
    }

    // Did this run beat EVERY entry in the logbook (rank #1)? The book shows
    // "DOWN <n>" and "₩<amount>" per entry; we compare our downs and sales
    // against the best of each. An explicit NEW RECORD banner also counts.
    function parseMoneyToken(t) {
        const m = String(t).replace(/,/g, '').match(/([\d.]+)\s*([kKmM]?)/);
        if (!m) return null;
        let v = parseFloat(m[1]);
        if (/k/i.test(m[2])) v *= 1e3;
        if (/m/i.test(m[2])) v *= 1e6;
        return v;
    }
    function isTopRecord(stats) {
        if (!stats) return false;
        let text = bodyText();
        // strip OUR OWN stats header so we never compare against ourselves
        text = text
            .replace(/TIME\s*SURVIVED[^0-9]*(?:\d{1,3}:)?\d{1,2}:\d{2}/i, ' ')
            .replace(/CUSTOMERS\s*DOWNED[^\d]*[\d,]+/i, ' ')
            .replace(/TODAY['’]?S\s*SALES[^₩\d]*₩?\s*[\d,.]+\s*[kKmM]?/i, ' ');
        // Board entries, in every observed format:
        //   times "107:01", downs "DOWN 397" or "42.3k", sales "₩74.9M"
        const times = [...text.matchAll(/\b(\d{1,3}):(\d{2})\b/g)].map(m => (+m[1]) * 60 + (+m[2]));
        const downs = [
            ...[...text.matchAll(/\bDOWN\s+([\d,]+)\b/gi)].map(m => +m[1].replace(/,/g, '')),
            ...[...text.matchAll(/(?<!₩)(?<!₩\s)\b(\d+(?:\.\d+)?)k\b/gi)].map(m => Math.round(parseFloat(m[1]) * 1000))
        ];
        const sales = [...text.matchAll(/₩\s*([\d,.]+\s*[kKmM]?)/g)].map(m => parseMoneyToken(m[1])).filter(v => v != null);
        if (times.length || downs.length || sales.length) {
            // NUMBERS ARE THE ONLY TRUTH. The decorative "TOP RECORD / RANK 1"
            // frame is ALWAYS on the hell results screen — it shows the
            // standing champion, not our result. Rank #1 means beating EVERY
            // listed entry outright on at least one column.
            // USER RULE: the crown is TIME. When the board shows survival
            // times (the hell ranking always does), ONLY beating the best
            // time counts — downs/sales records keep the bot on RETRY.
            if (times.length) return (stats.time || 0) > Math.max(...times);
            const beatD = downs.length ? (stats.downs || 0) > Math.max(...downs) : false;
            const beatS = sales.length ? (stats.sales || 0) > Math.max(...sales) : false;
            return beatD || beatS;
        }
        // No numbers at all — only an explicit NEW RECORD banner counts.
        // ("RANK 1" / "TOP RECORD" are permanent screen decorations.)
        return /NEW\s*RECORD/i.test(text);
    }

    // Click an element by what its inline onclick HANDLER does, not its text.
    // The game wires screens with onclick="enterHell()" etc., and some
    // controls are images with no text at all.
    function clickByHandler(re) {
        for (const el of document.querySelectorAll('[onclick]')) {
            if (!visible(el)) continue;
            if (re.test(el.getAttribute('onclick') || '')) return clickEl(el);
        }
        return false;
    }

    // Click an element identified by its id/class (image buttons and styled
    // divs often have no text and no inline onclick attribute).
    function clickByIdClass(re) {
        for (const el of document.querySelectorAll('[id], [class]')) {
            if (!visible(el)) continue;
            const sig = (el.id || '') + ' ' + String(el.className || '');
            if (!re.test(sig)) continue;
            if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'IMG' ||
                el.onclick || el.getAttribute('onclick') || /btn|button|door|entry/i.test(sig)) {
                return clickEl(el);
            }
        }
        return false;
    }

    // When every way of finding the hell entry fails, record what WAS on
    // screen so diagnostics can show exactly what the bot saw.
    function captureGiveUp(tag) {
        try {
            const items = [];
            for (const el of document.querySelectorAll('button, a, [role="button"], [onclick], .btn, img')) {
                if (!visible(el)) continue;
                items.push({
                    text: (el.textContent || '').trim().slice(0, 40),
                    onclick: ((el.getAttribute && el.getAttribute('onclick')) || '').slice(0, 50),
                    sig: (el.id ? '#' + el.id : '') + (el.className ? ' .' + String(el.className).slice(0, 30) : ''),
                    tag: el.tagName
                });
                if (items.length >= 20) break;
            }
            lastGiveUp = { where: tag, state: G.state, controls: items };
            console.warn('[PineBot] hell-entry search gave up at', tag, '— visible controls:', items);
        } catch (e) { }
    }

    // AFTER HOURS → HELL routing, usable from the plaza OR the closing-time
    // screen. Only an UNAMBIGUOUS entrance click flags the run as hell — a
    // loose /hell/ match might be a leaderboard tab, so it clicks without
    // flagging (the in-run HUD/lexical latch confirms real hell entry).
    function tryAfterHoursHell() {
        if (!CONFIG.autoEnterHell) return false;
        // v6.88.0 AUDIT C3. `🔥 hell` also matches #hellToggleBtn, the results
        // screen's LEADERBOARD toggle — which is present after perfectly normal
        // runs. The /toggle/ exclusion existed only on the loose fallback below
        // (which does NOT latch hellDetected); the dangerous path had none. A
        // stray toggle click therefore set pendingHellEntry, and startRun then
        // scored the whole NEXT day run under hell rules, collecting
        // hellEntered + the unbounded hellTimeBonus for a run that never left
        // the day. Same exclusion, applied where it matters.
        const notToggle = el => el && !/toggle|board|tab|switch/i.test(
            (el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('onclick') || ''));
        if (clickTextIf(/enter\s*hell|go\s*to\s*hell|🔥\s*hell/i, notToggle) ||
            clickByHandler(/enter\s*_?hell|enterhell/i) ||
            clickByIdClass(/hell(btn|button|door|entry|enter)|enterhell/i)) {
            hellDetected = true;
            pendingHellEntry = true;
            setStatus('AFTER HOURS — entering HELL');
            return true;
        }
        if (clickText(/after[\s-]*hours/i) ||
            clickByHandler(/after\s*_?hours?|afterhour/i) ||
            clickByIdClass(/after[-_]?hours?/i)) {
            setStatus('going AFTER HOURS');
            return true;
        }
        // Loose fallback — but NEVER the leaderboard toggle (#hellToggleBtn /
        // toggleHellBoard), which merely switches the visible score board.
        const loose = findByText(/\bhell\b/i);
        if (loose && !/toggle/i.test((loose.id || '') + (loose.getAttribute('onclick') || ''))) {
            clickEl(loose);
            setStatus('hell option clicked (unconfirmed)');
            return true;
        }
        return false;
    }

    // Shared game-over logic: stop for manual name entry on a record the user
    // cares about; otherwise leave the logbook untouched and restart.
    // The live rank-1 hell time, straight from the game's own board.
    function liveCrownTimeS() {
        try {
            const b = JSON.parse(localStorage.getItem('paco_bdh_time') || '[]');
            const best = b.map(e => +e.time).filter(t => isFinite(t) && t > 0).sort((x, y) => y - x)[0];
            if (best) return best;
        } catch (e) { }
        return CONFIG.crownTimeS;
    }

    function recordStopReason() {
        // CROWN THRESHOLD first — it does not depend on the board rendering,
        // on the name prompt being detected, or on our own row being stripped
        // out of the parse. A ranked hell run past the known #1 time is a #1.
        const ct = liveCrownTimeS() || CONFIG.crownTimeS;
        if (CONFIG.stopOnHellRecord && ct && lastRunStats && (lastRunStats.time || 0) > ct &&
            (hellRunEnded || hellLexicalFlag())) {
            return 'HELL #1 — beat the crown time (' + Math.round(lastRunStats.time) + 's > ' + ct + 's) — type your name yourself';
        }
        if (!looksLikeNameEntry()) return null;
        // Only an actual #1 score stops the bot — a name-entry prompt alone
        // does not. Hell status is judged on the run that just ENDED
        // (hellRunEnded), not the live flag — clicking a hell entrance on
        // this same screen must not retroactively flag a normal run.
        const top = isTopRecord(lastRunStats);
        if (!top) return null;
        if (CONFIG.stopOnHellRecord && (hellRunEnded || hellLexicalFlag()))
            return 'HELL #1 RECORD — type your name yourself';
        if (CONFIG.stopOnTopRecord)
            return 'TOP RECORD (#1) — type your name yourself';
        return null;
    }

    // Per-state handlers. Each returns true if it acted.
    const STATE_HANDLERS = {
        title() {
            return !!callFirst(['goSelect']) || clickText(/^(start|play)/i);
        },
        select() { return startWithBartender() || false; },
        world() {
            // v6.85.1 LIVE-VERIFIED: the 'world' screen IS the bartender
            // picker. Its START button (.wb-play) is hard-wired to
            // startGame('<highlighted world bartender>') — minguk by default —
            // so clicking "start" here silently ignored the rotation. If a
            // start control is on screen, start with OUR bartender instead;
            // otherwise this is the post-start crawl: reveal/skip it.
            if (worldPickerVisible() && startWithBartender()) return true;
            return !!callFirst(['revealGame', 'skipIntro']) || clickText(/^(enter|go|start|open)/i);
        },
        intro() {
            return !!callFirst(['skipIntro', 'revealGame']) || clickText(/^skip/i);
        },
        menu() {
            return !!callFirst(['resumeGame']) || clickText(/resume|continue/i);
        },
        // v6.87.5: the movement loop owns play, but the fusion prompt is a
        // DOM overlay that leaves G.state on 'playing' — so it has to be
        // checked here or it is never seen at all.
        playing() { return takeCraftPrompt(); },
        levelup() {
            // v6.88.1 L3: this handler now OWNS the stall. It used to fall
            // through to `clickCardByIndex(0)`, which returns false whenever
            // cardElements() matches none of its six selectors (it matches none
            // in the live DOM) — and a false here hands the screen to the
            // generic stuck-breaker, which proceeded to click the settings gear,
            // the recipe book, the mute toggle and pause, in order, forever.
            // A level-up is never resolved by any of those, so the breaker must
            // not see this state at all: claim the tick either way.
            if (handleLevelUp()) { levelupStuckAt = 0; return true; }
            const now = Date.now();
            if (!levelupStuckAt) levelupStuckAt = now;
            if (now - levelupStuckAt > 2500) {
                // Held for 2.5 s with nothing taken. Force the latch open and
                // eat the first card — a suboptimal pick costs one card; a
                // wedged level-up costs the run.
                levelupStuckAt = now;
                lastPoolSig = null; lastPoolRef = null;
                log('level-up wedged — forcing a pick');
                setStatus('level-up wedged — forced pick');
                if (hasGame('pickUpgrade')) { callGame('pickUpgrade', 0); return true; }
                clickCardByIndex(0) || clickText(/\+\s*\d|lv\.?\s*\d/i);
            }
            return true;
        },
        craft() {
            // Secret crafts are always an upgrade — accept, and pick the best option.
            const choices = safe(() => window._craftPool, null) || safe(() => window._cpool, null);
            if (Array.isArray(choices) && choices.length && hasGame('pickCraftChoice')) {
                const best = choices.map(scoreCard).sort((a, b) => b.score - a.score)[0];
                if (best) {
                    runPicks.push(best.name);
                    runPickCounts[best.name] = (runPickCounts[best.name] || 0) + 1;
                    ownedLevels[best.name] = Math.max(ownedLevels[best.name] || 0, 1);
                    craftsThisRun++;
                    callGame('pickCraftChoice', best.index);
                    return true;
                }
            }
            if (hasGame('confirmCraft')) { craftsThisRun++; callGame('confirmCraft'); return true; }
            if (hasGame('pickCraftChoice')) { craftsThisRun++; callGame('pickCraftChoice', 0); return true; }
            return takeCraftPrompt();
        },
        notice() {
            return !!callFirst(['closeNotice']) || clickText(/got it|ok|close|continue/i);
        },
        tip() {
            return !!callFirst(['closeTip']) || clickText(/cheers|thanks|got it|ok|close/i);
        },
        tipreward() {
            return !!callFirst(['closeTip', 'closeNotice']) || clickText(/cheers|thanks|got it|ok|close/i);
        },
        over() {
            if (runActive) { deathSnapshot = deathSnapshot || snapshotStats(); finishRun(); }
            releaseAll();
            const reason = recordStopReason();
            if (reason) {
                stopBot(reason);
                // Freeze the game too — nothing should keep running behind
                // the record screen while it waits for the user's name.
                if (hasGame('pauseGame')) callGame('pauseGame');
                return true;
            }
            // Hell entry happens at the finale overlay during 'playing', not
            // here. Never hunt for it after a HELL run just ended (the 🔥 HELL
            // heading on its results screen is not an entrance).
            if (!hellRunEnded && hellTries < 2) {
                if (tryAfterHoursHell()) { hellTries++; return true; }
                captureGiveUp('over-screen');   // audit fix: was dead code — reports the controls seen when entry fails
            }
            // Ordinary run: never touch the NAME/SAVE form — no bot entries in
            // the logbook. RETRY is the fastest path into the next run.
            return clickText(/^\W*retry\b/i) || !!callFirst(['backToTitle']) ||
                clickText(/again|continue|title|back/i);
        },
        highscore() {
            // v6.88.0 AUDIT C5. over() opens with finishRun()+releaseAll(); this
            // peer terminal state did neither, yet reads lastRunStats through
            // recordStopReason. If the game can reach 'highscore' without
            // passing 'over', the run was never credited, the crown check
            // compared the PREVIOUS run's time, keys stayed held, and runActive
            // stayed true — so the next run inherited ownedLevels, supersMade,
            // hellDetected and runStart, and two runs were eventually credited
            // as one. Idempotent: finishRun is a no-op once runActive is false.
            if (runActive) {
                deathSnapshot = deathSnapshot || snapshotStats();
                finishRun();
                releaseAll();
            }
            const reason = recordStopReason();
            if (reason) {
                stopBot(reason);
                // Freeze the game too — nothing should keep running behind
                // the record screen while it waits for the user's name.
                if (hasGame('pauseGame')) callGame('pauseGame');
                return true;
            }
            // Non-record run: click the REAL RETRY button first — it closes
            // the score overlay properly. API navigation (backToTitle) can
            // flip the internal state while the overlay stays up, leaving the
            // game running "behind" the high score screen.
            return clickText(/^\W*retry\b/i) || clickText(/again|continue/i) ||
                !!callFirst(['backToTitle']) || clickTextIf(/^(title|back|ok|menu)$/i, notNameForm);
        },
        plaza() {
            // VERIFIED: 'plaza' is the SOCIAL chat hub (openPlaza/plazaSay),
            // not the day-end flow — hell entry happens at the #finaleMsg
            // overlay during 'playing'. If we somehow land here, just leave.
            return !!callFirst(['closePlaza', 'backToTitle']) || clickText(/close|back|exit|title/i);
        }
    };

    function handleScreens() {
        const st = G.state;
        const now = Date.now();

        if (st !== lastState) {
            log('state:', lastState, '->', st);
            lastState = st;
            lastStateAt = now;
            stuckTries = 0;
            hellTries = 0;
            if (st === 'playing' && !runActive) startRun();
            else if (st === 'playing' && runActive) pendingHellEntry = false;  // same-run hell continuation: flag already latched
            if (st !== 'playing') releaseAll();
        }


        if (st == null) return domFallbackScreens();

        // A level-up pool can appear while `state` still reads 'playing' on some frames.
        if (st === 'playing') {
            latchHellDuringPlay();   // hell is only ever detected mid-run, never from menus

            // v6.87.6 (user: "always pick make black vermouth"). The fusion
            // prompt lives HERE, not in STATE_HANDLERS. The 'playing' branch
            // of handleScreens returns before the STATE_HANDLERS dispatch ever
            // runs, so 6.87.5's `playing() { return takeCraftPrompt(); }` was
            // dead code — a gate that never opens, and the unit test missed it
            // by calling the handler directly instead of going through
            // handleScreens(). Checked first: the prompt pauses the field, so
            // nothing else in this branch can matter while it is up.
            if (takeCraftPrompt()) return true;

            // THE REAL AFTER-HOURS FLOW (verified from the live game):
            // finale prompts appear while state is STILL 'playing', and their
            // continue buttons carry the class `fin-continue`. The chase
            // prompt (JOE SHOWS UP → START RUNNING) has one; the day-end
            // choice has TWO — CLOCK OUT (decline → gameOver) and
            // AFTER-HOURS · HELL (ranked + Rainbow) → enterHell(), which
            // continues THIS run in hell. Click the BUTTON, never the
            // headline, and never press the decline while auto-hell is on.
            // FAILSAFE (live-diagnosed: 40+ minute runs STILL landing in
            // unranked after-hours): if the finale minute arrives and hell
            // has not been latched, call the game's own enterHell() directly
            // — and snapshot whatever the screen shows for post-mortem.
            const gtFin = typeof G.gameTime === 'number' ? G.gameTime : 0;
            if (CONFIG.autoEnterHell && !hellDetected && gtFin >= 1200 && gtFin < 1320 && hellTries < 4) {
                if (hasGame('enterHell')) {
                    hellTries++;
                    captureGiveUp('finale-failsafe');
                    if (callGame('enterHell').ok) {
                        hellDetected = true; hellEnteredAt = gameMs(); dayClearedThisRun = true;
                        setStatus('FAILSAFE: enterHell() called directly at finale');
                        return true;
                    }
                }
            }
            const fmsg = document.getElementById('finaleMsg');
            const fmsgOpen = fmsg && !fmsg.classList.contains('hidden');
            let finBtns = [...document.querySelectorAll('.fin-continue')].filter(visible);
            if (!finBtns.length && fmsgOpen) {
                finBtns = [...fmsg.querySelectorAll('button, [onclick], .btn, a')].filter(visible);
                if (!finBtns.length) finBtns = [...fmsg.children].filter(el => visible(el) && (el.textContent || '').trim());
            }
            if (finBtns.length) {
                const ctxText = finBtns.map(b => b.textContent || '').join(' ') +
                    ' ' + (fmsgOpen ? fmsg.textContent || '' : '');
                // ranked-entry button ONLY: 'after' alone also matches the
                // NORMAL after-hours button — that one word cost two
                // 56-minute marathons their crown eligibility.
                const hellBtn = finBtns.find(b =>
                    /hell|🔥/i.test(b.textContent || '') ||
                    /enterhell/i.test(b.getAttribute('onclick') || ''));
                if (/hell|after[\s-]*hours|🔥/i.test(ctxText)) {
                    // Day-end choice screen.
                    if (CONFIG.autoEnterHell) {
                        if (hellBtn ? clickEl(hellBtn) : (hasGame('enterHell') && callGame('enterHell').ok)) {
                            hellDetected = true;
                            hellEnteredAt = gameMs();
                            dayClearedThisRun = true;
                            setStatus('AFTER-HOURS · HELL entered, same run continues');
                        }
                        return true;   // clicked or waiting — NEVER fall through to CLOCK OUT
                    }
                    const decline = finBtns.find(b => b !== hellBtn);
                    if (decline) { clickEl(decline); return true; }
                    if (hasGame('finaleContinue')) { callGame('finaleContinue'); return true; }
                    return true;
                }
                // Chase prompt / dialogue: press its continue button.
                clickEl(finBtns[0]);
                setStatus('finale: pressed "' + (finBtns[0].textContent || '').trim().slice(0, 18) + '"');
                return true;
            }
            if (fmsgOpen && hasGame('finaleGo')) { callGame('finaleGo'); return true; }
            // Same prompt rendered without the class: click the action button.
            if (findByText(/joe\s*shows?\s*up/i) &&
                (clickText(/start\s*running/i) || clickText(/^(start|run|go)\b/i))) {
                setStatus('JOE chase — START RUNNING pressed');
                return true;
            }

            if (readPool() && document.querySelector('#levelCards, .levelup, #upCards')) return handleLevelUp();
            return false;
        }

        const h = STATE_HANDLERS[st];
        let acted = false;
        if (h) { try { acted = !!h(); } catch (e) { log('handler error', st, e && e.message); } }
        if (!running) return true;

        // Stuck-breaker: state hasn't moved for a while and we're not playing.
        if (!acted && now - lastStateAt > 2200) {
            stuckTries++;
            lastStateAt = now;
            log('stuck in state', st, '— generic click attempt', stuckTries);
            // v6.88.0 AUDIT S2: `ok`, `yes` and `confirm` were unanchored, which
            // is the vocabulary of a name-SUBMIT button (and `ok` matches inside
            // LOGBOOK). The stated invariant is that the logbook is never
            // touched by the bot; enforce it on this branch too, not only on the
            // last-resort one below.
            const generic = /^(start|play|skip|continue|next|ok|confirm|got it|cheers|yes|retry|again|make it|enter|go|resume|close)\b|after\s*hours/i;
            if (!clickTextIf(generic, notNameForm)) {
                // v6.88.1 L4: cardElements()'s selectors are loose ('.cards > *',
                // '.choice'), so on a screen that is not a level-up they can
                // resolve to the HUD. Vetoed here too — a "card" named PAUSE is
                // not a card.
                const els = cardElements().filter(el => !CHROME_CTRL.test(String(el.textContent || '').trim()));
                if (els.length) clickEl(els[Math.min(stuckTries - 1, els.length - 1)]);
                else {
                    // never blind-click SAVE — the logbook must stay untouched.
                    // v6.88.1 L4: nor the game's CHROME. The blind click walks
                    // `stuckTries` along every visible button on the page, and
                    // the persistent HUD controls (⚙ settings, 📖 recipe book,
                    // ⏸ pause, 🔇 mute, and the book's own tab strip) are always
                    // among them. Clicking those opens modals that put MORE
                    // buttons on the page, so the breaker feeds itself: an
                    // observed run spent 24 s cycling settings → book → STAFF →
                    // ITEMS → CLOSE while a LEVEL UP sat unanswered behind them.
                    // None of these controls has ever advanced a stuck state.
                    const any = [...document.querySelectorAll('button, [role="button"], .btn')]
                        .filter(el => {
                            if (!visible(el)) return false;
                            const t = String(el.textContent || '').trim();
                            // an unlabelled icon button is chrome more often than not
                            if (!t || t.length <= 2) return false;
                            return !CHROME_CTRL.test(t);
                        });
                    if (any.length) clickEl(any[Math.min(stuckTries - 1, any.length - 1)]);
                    else log('stuck-breaker: nothing safe to click (all chrome)');
                }
            }
            acted = true;
        }
        return acted;
    }

    // Used only if `state` cannot be read at all.
    function domFallbackScreens() {
        if (readPool() || cardElements().length >= 2) return handleLevelUp() || clickCardByIndex(0);
        const seq = [/start\s*running/i, /^skip/i, /cheers/i, /got it/i, /make it/i, /resume/i, /^(start|play)/i, /^(pat|joe|minguk)$/i, /enter\s*hell|after[\s-]*hours/i, /retry|again/i];
        for (const re of seq) {
            const el = findByText(re);
            if (el) return clickEl(el);
        }
        return false;
    }

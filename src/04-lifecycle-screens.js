
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
        const crown = (typeof liveCrownTimeS === 'function' ? liveCrownTimeS() : 0) || CONFIG.crownTimeS || 14025;
        return depth + ms.crownProgress * (t / crown);
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
        return r;
    }

    function startRun() {
        runActive = true;
        runStart = Date.now();
        runPicks = [];
        runPickCounts = {};
        primaryCocktail = null;
        ownedLevels = {};
        ownedMax = {};
        lastPoolSig = null;
        hellDetected = pendingHellEntry;   // we took the hell entrance — this run IS hell
        hellEnteredAt = pendingHellEntry ? Date.now() : 0;
        pendingHellEntry = false;
        deathSnapshot = null;
        dangerAccum = { contact: 0, proj: 0, mark: 0, line: 0, rival: 0 };
        lastHpSample = null;
        enemyMix = { swarm: 0, ranged: 0, bomber: 0, boss: 0, total: 0 };
        computeRoadmap();   // the plan itself learns: re-derive from live build stats
        AVOID_INGREDIENTS = new Set(AVOID_INGREDIENTS_BASE);   // day rules until hell is latched
        hellUnbanApplied = false;
        if (hellDetected) applyHellUnban();
        killRate = 0; lastKillCount = null; lastKillAt = 0;
        pressureAvg = 0; toughnessAvg = 1; dpsDeficit = 0; passoutAvg = 0;
        supersThisRun = 0; craftsThisRun = 0; rainbowThisRun = false; dayClearedThisRun = false;
        rainbowAt = 0;
        rainbowChoice = null;
        lastLevelUpAt = Date.now();
        supersMade = new Set();
        runPickCtx = [];
        beginTrial();
        log('run started; roster', activeRoster, '| CEM gen', learn.cem.gen, 'batch', learn.cem.batch.length + '/' + CONFIG.learning.batchSize, 'tab', TAB_ID);
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
            v: SCRIPT_TAG
        });
        if (learn.runLog.length > 30) learn.runLog.shift();

        // PER-VERSION ROLLUP. runLog only keeps 30 entries, so version-vs-
        // version comparison needs its own durable accumulator. This is what
        // makes "which version performs best" an answerable question instead
        // of a reconstruction from memory. (v6.80.0: + downs/sales sums and
        // the version's TOP-N runs, so a frozen snapshot carries its best
        // runs with it.)
        {
            const vs = learn.versions[SCRIPT_TAG] || {
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
            learn.versions[SCRIPT_TAG] = vs;
        }

        endTrial(reward);
        saveLearn();

        const verdict = base == null ? 'first recorded run'
            : reward > base ? `better than recent average (${reward.toFixed(3)} vs ${base.toFixed(3)})`
                : `below recent average (${reward.toFixed(3)} vs ${base.toFixed(3)})`;
        console.log('%c[PineBot] RUN END', 'font-weight:bold;color:#ffd98a',
            `\n  time ${Math.round(stats.time)}s   downs ${stats.downs}   sales ${stats.sales}` +
            `\n  reward ${reward.toFixed(3)} — ${verdict}` +
            `\n  version: ${SCRIPT_TAG}   roster: ${activeRoster || '(none)'}   build: ${primaryCocktail || '(none)'}` +
            `\n  picks: ${runPicks.join(', ') || '(none)'}` +
            `\n  milestones: supers ${supersThisRun}, crafts ${craftsThisRun}` +
            `${dayClearedThisRun ? ', DAY CLEARED' : ''}${hellRunEnded ? ', HELL' : ''}${rainbowThisRun ? ', RAINBOW!' : ''}` +
            `\n  died to: ${lastDeathCause || 'unknown'}` +
            `\n  final frame: ${lastPlan ? lastPlan.diag : 'n/a'}`);
        setStatus(`run over — ${Math.round(stats.time)}s / ${stats.downs} / ${stats.sales}`);
    }

    // =================================================================
    // SCREEN AUTOMATION — driven by the game's own `state`
    // =================================================================
    function chooseBartender() {
        if (CONFIG.preferredBartender) return CONFIG.preferredBartender;
        let best = BARTENDERS[0], bestScore = -Infinity;
        for (const b of BARTENDERS) {
            const s = ucbScore(BARTENDER_TO_BASE_ATTACK[b]) + Math.random() * 0.05;
            if (s > bestScore) { bestScore = s; best = b; }
        }
        return best;
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
        if (hellLexicalFlag()) { hellDetected = true; hellEnteredAt = Date.now(); log('HELL run latched (lexical flag)'); return; }
        if (CONFIG.hellModeRegex.test(bodyText())) { hellDetected = true; hellEnteredAt = Date.now(); log('HELL run latched (HUD text)'); }
    }

    function looksLikeNameEntry() {
        return [...document.querySelectorAll('input')].some(visible);
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
        if (clickText(/enter\s*hell|go\s*to\s*hell|🔥\s*hell/i) ||
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
        select() {
            const b = chooseBartender();
            bartenderThisRun = b;
            if (hasGame('startGame')) { callGame('startGame', b); startRun(); return true; }
            const el = findByText(new RegExp('^' + b + '$', 'i'));
            if (el) { clickEl(el); startRun(); return true; }
            return false;
        },
        world() {
            return !!callFirst(['revealGame', 'skipIntro']) || clickText(/^(enter|go|start|open)/i);
        },
        intro() {
            return !!callFirst(['skipIntro', 'revealGame']) || clickText(/^skip/i);
        },
        menu() {
            return !!callFirst(['resumeGame']) || clickText(/resume|continue/i);
        },
        playing() { return false; },   // the movement loop owns this state
        levelup() {
            return handleLevelUp() || clickCardByIndex(0);
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
            return clickText(/make it|craft|confirm|yes/i);
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
                !!callFirst(['backToTitle']) || clickText(/title|back|ok/i);
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
                        hellDetected = true; hellEnteredAt = Date.now(); dayClearedThisRun = true;
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
                            hellEnteredAt = Date.now();
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
            const generic = /start|play|skip|continue|next|ok|confirm|got it|cheers|yes|retry|again|make it|enter|go|resume|close|after\s*hours/i;
            if (!clickText(generic)) {
                const els = cardElements();
                if (els.length) clickEl(els[Math.min(stuckTries - 1, els.length - 1)]);
                else {
                    // never blind-click SAVE — the logbook must stay untouched
                    const any = [...document.querySelectorAll('button, [role="button"], .btn')]
                        .filter(el => visible(el) && !/save/i.test(el.textContent || ''));
                    if (any.length) clickEl(any[Math.min(stuckTries - 1, any.length - 1)]);
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

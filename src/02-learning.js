
    // =================================================================
    // LEARNING (UCB bandit over item names + (1+1) param hill-climb)
    // =================================================================

    // Distribution stats for one rollup: median / SD / SE and the share of
    // runs past the 60- and 120-minute marks. Works off the stored time
    // list when present; falls back to the running sums.
    function rollupStats(vs) {
        const n = vs && vs.n ? vs.n : 0;
        if (!n) return {};
        const ts = Array.isArray(vs.times) ? vs.times.filter(t => isFinite(t)) : [];
        const mean = vs.sumT / n;
        let sd = null;
        if (isFinite(vs.sumT2) && n > 1) sd = Math.sqrt(Math.max(0, vs.sumT2 / n - mean * mean) * n / (n - 1));
        else if (ts.length > 1) { const m = ts.reduce((a, b) => a + b, 0) / ts.length; sd = Math.sqrt(ts.reduce((a, b) => a + (b - m) * (b - m), 0) / (ts.length - 1)); }
        let median = null;
        if (ts.length) { const s = ts.slice().sort((a, b) => a - b); const h = s.length >> 1; median = s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2); }
        const p60 = isFinite(vs.over60) ? +(vs.over60 / n).toFixed(2) : (ts.length ? +(ts.filter(t => t >= 3600).length / ts.length).toFixed(2) : null);
        const p120 = isFinite(vs.over120) ? +(vs.over120 / n).toFixed(2) : (ts.length ? +(ts.filter(t => t >= 7200).length / ts.length).toFixed(2) : null);
        return {
            medianTimeS: median, sdTimeS: sd == null ? null : Math.round(sd),
            seTimeS: sd == null ? null : Math.round(sd / Math.sqrt(n)),
            p60, p120, timesKept: ts.length,
            timesPartial: vs.timesPartial === true || undefined
        };
    }

    // Freeze one version's rollup into learn.snapshots. Idempotent per
    // (version, runs) pair; a re-freeze with new runs REPLACES the old one.
    function freezeSnapshot(d, tag, reason) {
        try {
            const vs = d.versions && d.versions[tag];
            if (!vs || !vs.n) return false;
            d.snapshots = d.snapshots || [];
            const rec = {
                version: tag, frozenAtRun: d.runs, reason: reason || 'version-change',
                frozenAt: new Date().toISOString(),
                runs: vs.n,
                meanTimeS: Math.round(vs.sumT / vs.n), bestTimeS: Math.round(vs.bestT),
                meanDowns: Math.round((vs.sumD || 0) / vs.n), meanSales: Math.round((vs.sumS || 0) / vs.n),
                meanReward: +(vs.sumR / vs.n).toFixed(3), rewardEpoch: vs.epoch,
                hellRate: +(vs.hell / vs.n).toFixed(2), dayClearRate: +(vs.day / vs.n).toFixed(2),
                supersPerRun: +(vs.sumSupers / vs.n).toFixed(1),
                deaths: { ...(vs.deaths || {}) },
                top: (vs.top || []).slice(),
                runRange: [vs.firstRun, vs.lastRun],
                ...rollupStats(vs)
            };
            const i = d.snapshots.findIndex(s => s.version === tag);
            if (i >= 0) d.snapshots[i] = rec; else d.snapshots.push(rec);
            while (d.snapshots.length > CONFIG.learning.snapshotKeep) d.snapshots.shift();
            return true;
        } catch (e) { return false; }
    }

    function loadLearn() {
        // v6.88.0 AUDIT R2: the JSON.parse calls were wrapped but every
        // structural access after them was not, and `d.x = d.x || {}` does not
        // catch a wrong TYPE. A stored {"cem":{"mean":5}} passed the truthiness
        // guard and then threw on property assignment to a number — and because
        // loadLearn runs at module scope, that throw aborted the whole IIFE and
        // NO PART of the bot loaded, permanently, until localStorage was cleared
        // by hand. With @grant none the script shares storage with the game
        // page, so this was reachable by anything with same-origin write access.
        try { return loadLearnInner(); }
        catch (e) {
            log('STORE UNREADABLE (' + (e && e.message) + ') — starting from defaults; the old blob is kept under ' + learnKey() + '.broken');
            try { localStorage.setItem(learnKey() + '.broken', localStorage.getItem(learnKey()) || ''); localStorage.removeItem(learnKey()); } catch (e2) { }
            try { return loadLearnInner(); } catch (e2) { return blankLearn(); }
        }
    }
    function blankLearn() {
        return {
            bartender: activeChar || 'minguk', items: {}, totalPicks: 0, history: [], runs: 0,
            builds: {}, hof: [], genHistory: [], runLog: [], rosters: {}, versions: {}, snapshots: [],
            rewardEpoch: REWARD_EPOCH, cem: null, linucb: {}
        };
    }
    function loadLearnInner() {
        let d = null;
        try { d = JSON.parse(localStorage.getItem(learnKey())); } catch (e) { }
        if (!d || typeof d !== 'object') d = {};
        // SHARED comparison state overlays the per-bartender blob. First
        // load migrates the legacy blob's versions/snapshots into the shared
        // store so history is never lost when a new bartender starts fresh.
        let shared = null;
        try { shared = JSON.parse(localStorage.getItem(SHARED_KEY)); } catch (e) { }
        if (!shared || typeof shared !== 'object') {
            let legacy = null;
            try { legacy = JSON.parse(localStorage.getItem(CONFIG.learning.storageKey)); } catch (e) { }
            shared = { versions: (legacy && legacy.versions) || {}, snapshots: (legacy && legacy.snapshots) || [], lastVersion: legacy && legacy.lastVersion };
        }
        d.versions = shared.versions || {};
        d.snapshots = shared.snapshots || [];
        if (shared.lastVersion && !d.lastVersion) d.lastVersion = shared.lastVersion;
        d.bartender = activeChar || 'minguk';
        d.items = d.items || {};          // name -> {n, sum}
        d.totalPicks = d.totalPicks || 0;
        d.history = d.history || [];      // recent rewards
        d.runs = d.runs || 0;
        d.builds = d.builds || {};        // primary cocktail -> {n, sum}
        d.hof = d.hof || [];              // hall of fame: top-5 runs ever {r, p}
        d.genHistory = d.genHistory || []; // mean batch reward per generation — the improvement curve
        d.runLog = d.runLog || [];        // last 30 runs, for the 📊 stats report
        d.rosters = d.rosters || {};      // roster id -> {n, sum} (roster experiment bandit)
        d.versions = d.versions || {};    // script version -> rollup, so versions can be COMPARED
        d.snapshots = d.snapshots || [];  // FROZEN per-version records (survive rollup resets)
        // REWARD EPOCH. computeReward's scale changed in v6.79.0 (the old one
        // saturated at 110 min, so a 252-min run scored BELOW a 115-min one).
        // Rewards from a different epoch are not comparable, so the baselines
        // that are pure reward numbers get cleared. Everything that encodes
        // LEARNING — cem.mean/sigma, item/build/roster/linucb statistics — is
        // kept, because those are still the best parameters we have found.
        if (d.rewardEpoch !== REWARD_EPOCH) {
            d.rewardEpoch = REWARD_EPOCH;
            d.hof = [];            // repopulates within ~5 runs
            d.genHistory = [];     // improvement curve restarts on the new scale
            d.history = [];
            d.lastGradient = null;
        }
        // VERSION CHANGE → FREEZE the outgoing version's rollup. This is what
        // makes "which version was best" answerable after the fact: the
        // record is written the moment a new script first loads, before it
        // can touch anything.
        if (d.lastVersion && d.lastVersion !== scriptTag()) {
            freezeSnapshot(d, d.lastVersion, 'version-change');
        }
        d.lastVersion = scriptTag();
        // BACKFILL (6.81.0): rollups written before the time list existed get
        // their recent times from runLog (last 30 runs carry a version tag),
        // so median / P60 have SOMETHING to work with until fresh runs land.
        for (const k of Object.keys(d.versions)) {
            const v = d.versions[k];
            if (!v || Array.isArray(v.times)) continue;
            const ts = (d.runLog || []).filter(e => e && e.v === k && isFinite(e.t)).map(e => Math.round(e.t));
            v.times = ts;
            v.timesPartial = ts.length < v.n;   // flagged: median covers the tail, not the whole history
        }
        // SEED: the crown-winning release predates per-version tracking, so
        // its row is entered by hand — best time read off the game's own hell
        // board (the crown run IS the board's #1), everything else unknown.
        if (!d.snapshots.some(s => s.version === '6.74.0')) {
            let crown = null;
            try {
                const b = JSON.parse(localStorage.getItem('paco_bdh_time') || '[]');
                crown = b.map(e => +e.time).filter(t => isFinite(t) && t > 0).sort((x, y) => y - x)[0] || null;
            } catch (e) { }
            d.snapshots.unshift({
                version: '6.74.0', frozenAtRun: d.runs, reason: 'seeded', frozenAt: new Date().toISOString(),
                runs: null, meanTimeS: null, bestTimeS: crown, meanReward: null, rewardEpoch: 1,
                hellRate: null, dayClearRate: null, supersPerRun: null, deaths: {}, top: [],
                note: 'CROWN WINNER (user-confirmed). Pre-dates per-version tracking; bestTimeS = hell board #1 at seed time.'
            });
        }
        d.linucb = d.linucb || {};        // card name -> diagonal LinUCB model {n, A[d], b[d]}
        d.rainbowPolicy = d.rainbowPolicy || {};   // 'take' | 'skip' -> {n, sum} (crown-path bandit)
        d.spawnIntel = d.spawnIntel || {};         // enemy class -> {n, sum} of first-seen gameTime (measured timetable)
        // Bartender priors. The hell crown board is the strongest evidence we
        // have: 9 of the top 10 (including the 126-min #1) played PAT — his
        // 180 HP + splash survive deep hell. Seed PAT above JOE; real results
        // take over from there.
        if (!d.items['SHAKING']) d.items['SHAKING'] = { n: 1, sum: 0.7 };
        if (!d.items['STIRRING']) d.items['STIRRING'] = { n: 1, sum: 0.55 };
        // migrate older tuning formats (v5.0 single-point, v5.2 population)
        // into the CEM distribution, seeded from the best params found so far
        if (!d.cem || !d.cem.mean) {
            let seed = DEFAULT_PARAMS;
            if (Array.isArray(d.pop) && d.pop.length) {
                let best = null;
                for (const s of d.pop) if (s.n > 0 && (!best || s.sum / s.n > best.sum / best.n)) best = s;
                if (best) seed = best.params;
            } else if (d.tuning && d.tuning.best) seed = d.tuning.best;
            const mean = {}, sigma = {};
            for (const k of Object.keys(TUNABLE)) {
                const spec = TUNABLE[k];
                mean[k] = Math.min(spec.max, Math.max(spec.min, seed[k] ?? DEFAULT_PARAMS[k]));
                sigma[k] = (spec.max - spec.min) * CONFIG.learning.sigmaInit;
            }
            d.cem = { mean, sigma, batch: [], gen: 0 };
            delete d.pop;
            delete d.tuning;
        }
        // CRITICAL: backfill parameters added in NEWER versions. A stored CEM
        // from an older script lacks entries for new TUNABLE keys; sampling
        // those would produce NaN, silently poisoning every strategy weight
        // and making level-up picks effectively random.
        // CMA-ES-lite state: evolution path + adaptive step size (backfilled
        // for stores written by pre-CMA versions).
        if (!d.cem.pc || typeof d.cem.pc !== 'object') d.cem.pc = {};
        if (!isFinite(d.cem.ss)) d.cem.ss = 1;
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k];
            const range = spec.max - spec.min;
            if (!isFinite(d.cem.mean[k])) d.cem.mean[k] = DEFAULT_PARAMS[k];
            if (!isFinite(d.cem.pc[k])) d.cem.pc[k] = 0;
            if (!isFinite(d.cem.sigma[k])) d.cem.sigma[k] = range * CONFIG.learning.sigmaInit;
            // When bounds widen between versions, old converged sigmas are too
            // tight to explore the newly opened territory — re-floor them
            // against the CURRENT range so the learner can walk into it.
            if (d.cem.sigma[k] < range * CONFIG.learning.sigmaFloor)
                d.cem.sigma[k] = range * CONFIG.learning.sigmaFloor;
        }
        return d;
    }
    function saveLearn() {
        // v6.88.0 AUDIT R1. Three defects in five lines. (1) The SHARED blob was
        // written first, so a quota throw skipped the per-bartender store —
        // the CEM mean/sigma, hall of fame, item and build stats — entirely.
        // (2) The catch was empty, so that happened silently: learn.runs stops
        // advancing, the CEM stops refitting across reloads, and nothing says
        // so. (3) learn.versions grows a permanent ~3.7 KB entry per
        // version x profile x bartender and was never pruned, which is what
        // eventually causes the throw. Now: own store first (it is the one
        // that must survive), versions pruned like snapshots already were, and
        // a failure is logged and surfaced once.
        const own = (() => { const { versions, snapshots, ...rest } = learn; return rest; })();
        let ok = true;
        try { localStorage.setItem(learnKey(), JSON.stringify(own)); }
        catch (e) { ok = false; log('SAVE FAILED (own store): ' + (e && e.name) + ' — learning for this run is lost'); }
        try {
            pruneVersions();
            localStorage.setItem(SHARED_KEY, JSON.stringify({
                versions: learn.versions || {}, snapshots: learn.snapshots || [], lastVersion: learn.lastVersion
            }));
        } catch (e) {
            log('SAVE FAILED (shared table): ' + (e && e.name) + ' — comparison history is not being recorded');
            ok = false;
        }
        if (!ok && !saveWarned) { saveWarned = true; try { setStatus('⚠ localStorage full — learning is NOT being saved'); } catch (e2) { } }
        return ok;
    }

    // v6.88.0 AUDIT R1: keep the shared comparison table bounded. Rows are kept
    // by run count (the ones that carry evidence), never below the most recent
    // versionKeep tags, so an active version is never dropped mid-measurement.
    function pruneVersions() {
        const V = learn.versions || {};
        const keys = Object.keys(V);
        const cap = CONFIG.learning.versionKeep || 40;
        if (keys.length <= cap) return;
        const recent = new Set(keys.slice(-8));
        recent.add(scriptTag());
        const ranked = keys.filter(k => !recent.has(k))
            .sort((a, b) => (V[b].n || 0) - (V[a].n || 0))
            .slice(0, Math.max(0, cap - recent.size));
        const keep = new Set([...recent, ...ranked]);
        let dropped = 0;
        for (const k of keys) if (!keep.has(k)) { delete V[k]; dropped++; }
        if (dropped) log('pruned ' + dropped + ' low-evidence version row(s) from the shared table');
    }
    function resetLearn() {
        // Snapshots are the historical record — freeze the live version
        // first, then preserve every snapshot across the reset.
        let keep = [];
        try {
            freezeSnapshot(learn, scriptTag(), 'pre-reset');
            keep = (learn.snapshots || []).slice();
        } catch (e) { }
        try { localStorage.removeItem(learnKey()); } catch (e) { }   // this bartender only; shared history untouched
        learn = loadLearn();
        if (keep.length) { learn.snapshots = keep; saveLearn(); }
        applyParams(DEFAULT_PARAMS);
        setStatus('learning reset for ' + (activeChar || 'minguk') + ' (other bartenders + version snapshots kept)');
    }

    // ---- VERSION COMPARISON ------------------------------------------
    // One row per version: live rollups (still accumulating) merged over
    // frozen snapshots (a frozen record wins only if the live one is gone).
    // Ordered by release so each row carries deltas vs the row before it.
    function versionRows() {
        const rows = {};
        for (const s of (learn.snapshots || [])) rows[s.version] = { ...s, status: 'frozen' };
        const V = learn.versions || {};
        for (const k of Object.keys(V)) {
            const v = V[k];
            if (!v || !v.n) continue;
            rows[k] = {
                version: k, status: 'live', runs: v.n,
                meanTimeS: Math.round(v.sumT / v.n), bestTimeS: Math.round(v.bestT),
                meanDowns: Math.round((v.sumD || 0) / v.n), meanSales: Math.round((v.sumS || 0) / v.n),
                meanReward: +(v.sumR / v.n).toFixed(3), rewardEpoch: v.epoch,
                hellRate: +(v.hell / v.n).toFixed(2), dayClearRate: +(v.day / v.n).toFixed(2),
                supersPerRun: +(v.sumSupers / v.n).toFixed(1),
                deaths: v.deaths || {}, top: (v.top || []).slice(), runRange: [v.firstRun, v.lastRun],
                note: rows[k] && rows[k].note,
                ...rollupStats(v)
            };
        }
        const semver = s => String(s).split('+')[0].split('.').map(n => +n || 0);
        const cmp = (a, b) => {
            const x = semver(a.version), y = semver(b.version);
            for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
            return String(a.version).localeCompare(String(b.version));
        };
        // v6.88.0 AUDIT C2. Every guard here used the GLOBAL isFinite, and
        // `isFinite(null) === true` — so every unknown field passed as 0.
        //   * the hand-seeded 6.74.0 row carries meanTimeS: null, so the next
        //     row reported invented deltas against a version with no mean;
        //   * a row with ONE run has seTimeS === null (rollupStats leaves sd
        //     null at n=1), which entered the Welch denominator as zero.
        // That is exactly how 6.85.18+crown+pat came to read n=1, z=+8.66,
        // "better" — immediately before its successor read z=-32.43 at n=57.
        // Number.isFinite rejects null. A verdict also now requires 2+ runs on
        // BOTH sides, and rows under the significance floor say so out loud.
        const fin = Number.isFinite;
        const MIN_VERDICT_RUNS = 2;
        const out = Object.values(rows).sort(cmp);
        let prev = null;
        for (const r of out) {
            if (r.runs < CONFIG.learning.minMeaningfulRuns) r.underpowered = true;
            if (prev && fin(r.meanTimeS) && fin(prev.meanTimeS)) {
                // z-score of the mean-time gap (Welch). |z| < 2 = still noise.
                let z = null;
                if (fin(r.seTimeS) && fin(prev.seTimeS) && (r.seTimeS || prev.seTimeS) &&
                    r.runs >= MIN_VERDICT_RUNS && prev.runs >= MIN_VERDICT_RUNS)
                    z = +((r.meanTimeS - prev.meanTimeS) / Math.sqrt(r.seTimeS * r.seTimeS + prev.seTimeS * prev.seTimeS)).toFixed(2);
                r.vsPrev = {
                    version: prev.version,
                    meanTimeS: r.meanTimeS - prev.meanTimeS,
                    medianTimeS: (fin(r.medianTimeS) && fin(prev.medianTimeS)) ? r.medianTimeS - prev.medianTimeS : null,
                    bestTimeS: (fin(r.bestTimeS) && fin(prev.bestTimeS)) ? r.bestTimeS - prev.bestTimeS : null,
                    hellRate: (fin(r.hellRate) && fin(prev.hellRate)) ? +(r.hellRate - prev.hellRate).toFixed(2) : null,
                    p60: (fin(r.p60) && fin(prev.p60)) ? +(r.p60 - prev.p60).toFixed(2) : null,
                    z, verdict: z == null ? 'insufficient data'
                        // v6.88.2: name WHICH side is thin. The old label said
                        // "n<20" on rows with n=47 because the row they were
                        // being compared against was the underpowered one, so
                        // the table reported a well-supported row as weak.
                        : (r.underpowered || prev.underpowered)
                            ? 'UNDERPOWERED (' +
                              (r.underpowered && prev.underpowered
                                  ? 'both rows, n=' + r.runs + ' vs ' + prev.runs
                                  : r.underpowered
                                      ? 'this row, n=' + r.runs
                                      : 'BASELINE ' + prev.version + ', n=' + prev.runs) +
                              ' < ' + CONFIG.learning.minMeaningfulRuns + ') — z is not evidence'
                            : (Math.abs(z) < 2 ? 'noise (|z|<2)' : (z > 0 ? 'better (z>=2)' : 'worse (z<=-2)'))
                };
            }
            // only a row with a REAL mean becomes the comparison baseline
            if (fin(r.meanTimeS) && r.runs >= MIN_VERDICT_RUNS) prev = r;
        }
        return out;
    }
    function versionComparison() {
        const rows = versionRows();
        const withData = rows.filter(r => isFinite(r.bestTimeS));
        const bestByTime = withData.slice().sort((a, b) => b.bestTimeS - a.bestTimeS)[0] || null;
        const bestByMean = withData.filter(r => isFinite(r.meanTimeS)).sort((a, b) => b.meanTimeS - a.meanTimeS)[0] || null;
        const bestByP60 = withData.filter(r => isFinite(r.p60) && r.runs >= 20).sort((a, b) => b.p60 - a.p60)[0] || null;
        const epochs = new Set(rows.map(r => r.rewardEpoch).filter(e => e != null));
        return {
            note: epochs.size > 1
                ? 'meanReward spans MULTIPLE reward epochs — compare meanTimeS/bestTimeS instead'
                : 'single reward epoch — all fields comparable',
            current: scriptTag(),
            bestPeak: bestByTime ? { version: bestByTime.version, bestTimeS: bestByTime.bestTimeS } : null,
            bestAverage: bestByMean ? { version: bestByMean.version, meanTimeS: bestByMean.meanTimeS, medianTimeS: bestByMean.medianTimeS, runs: bestByMean.runs } : null,
            bestDeepRunRate: bestByP60 ? { version: bestByP60.version, p60: bestByP60.p60, p120: bestByP60.p120, runs: bestByP60.runs } : null,
            howToRead: 'bestPeak is a lottery that grows with run count. Judge versions on medianTimeS / p60 / p120 and the vsPrev z-score.',
            versions: rows
        };
    }
    // Back-compat alias (older console habits): same table, time-sorted.
    function versionReport() {
        const c = versionComparison();
        return { note: c.note, versions: c.versions.slice().sort((a, b) => (b.bestTimeS || 0) - (a.bestTimeS || 0)) };
    }
    // Manual snapshot: freeze the running version NOW (e.g. before editing
    // the script), and hand-annotate any version's row.
    function snapshotNow(reason) {
        learn = loadLearn();
        const ok = freezeSnapshot(learn, scriptTag(), reason || 'manual');
        saveLearn();
        setStatus(ok ? '📸 snapshot saved: ' + scriptTag() : '📸 nothing to snapshot yet (no runs on ' + scriptTag() + ')');
        return ok;
    }
    function noteVersion(tag, patch) {
        learn = loadLearn();
        learn.snapshots = learn.snapshots || [];
        let s = learn.snapshots.find(x => x.version === tag);
        if (!s) { s = { version: tag, reason: 'manual', frozenAt: new Date().toISOString(), deaths: {}, top: [] }; learn.snapshots.push(s); }
        Object.assign(s, patch || {});
        saveLearn();
        return s;
    }

    function itemStat(name) {
        const s = learn.items[name];
        if (!s || !s.n) return null;
        return { n: s.n, mean: s.sum / s.n };
    }
    function ucbScore(name) {
        const s = itemStat(name);
        const total = Math.max(1, learn.totalPicks);
        if (!s) return CONFIG.learning.c * Math.sqrt(Math.log(total + 1)) * 0.5; // optimistic for unseen
        return s.mean * 10 + CONFIG.learning.c * Math.sqrt(Math.log(total + 1) / s.n);
    }
    function creditItems(reward) {
        const total = Math.max(1, runPicks.length);
        for (const name of Object.keys(runPickCounts)) {
            let weight = Math.min(1, runPickCounts[name] / 3);
            // Early picks shape the whole run — credit them ~1.5x vs late picks.
            const firstIdx = runPicks.indexOf(name);
            if (firstIdx >= 0) weight *= 1.5 - 0.5 * (firstIdx / total);
            const s = learn.items[name] || { n: 0, sum: 0 };
            s.n = s.n * CONFIG.learning.decay + weight;
            s.sum = s.sum * CONFIG.learning.decay + reward * weight;
            learn.items[name] = s;
            learn.totalPicks++;
        }
    }

    function baseline() {
        const h = learn.history;
        if (!h.length) return null;
        const w = h.slice(-CONFIG.learning.baselineWindow);
        return w.reduce((a, b) => a + b, 0) / w.length;
    }

    // ---- CEM (Cross-Entropy Method) optimizer ------------------------
    // Every run samples parameters from a per-parameter Gaussian. Runs are
    // collected into a batch (shared across tabs); when the batch is full,
    // the distribution is refit toward the TOP-RANKED runs and exploration
    // shrinks. Rank-based elite selection is what makes this robust: a
    // freak lucky run can only ever be one elite among several, whereas the
    // old mean-comparison optimizers let single outliers steer everything.
    function bestParams() { return learn.cem ? learn.cem.mean : DEFAULT_PARAMS; }

    // v6.85.23: sanitize the CEM state. 6.85.22 added TUNABLE keys with no
    // stored mean/sigma, so 273 runs sampled NaN for them; the NaN entries
    // rode into batch/hof vectors and the step-size update, freezing
    // exploration. Strip every non-finite value and reset ss if poisoned.
    function sanitizeCem() {
        try {
            const c = learn && learn.cem;
            if (!c) return;
            const bad = v => !(typeof v === 'number' && isFinite(v));   // null survives JSON and passes isFinite!
            for (const tbl of [c.mean, c.sigma, c.pc]) {
                if (!tbl) continue;
                for (const k of Object.keys(tbl)) if (bad(tbl[k])) delete tbl[k];
            }
            if (bad(c.ss)) c.ss = 1;
            // v6.86.0: means drift outside their box when a TUNABLE bound is
            // tightened (deepFocusLv 6 -> 4 this version). Clamp, don't drop.
            for (const k of Object.keys(TUNABLE)) {
                const spec = TUNABLE[k];
                if (isFinite(c.mean[k])) c.mean[k] = Math.min(spec.max, Math.max(spec.min, c.mean[k]));
            }
            // legacy hof entries predate mean-tracking: give them one observation
            if (Array.isArray(learn.hof)) for (const h of learn.hof) {
                if (!isFinite(h.n)) { h.n = 1; h.sum = h.r; h.best = h.r; }
            }
            const clean = arr => Array.isArray(arr) ? arr.map(e => {
                if (e && e.p) for (const k of Object.keys(e.p)) if (bad(e.p[k])) delete e.p[k];
                return e;
            }) : arr;
            c.batch = clean(c.batch);
            learn.hof = clean(learn.hof);
            // v6.85.23: the 6.85.22 enemy-type multipliers stopped being
            // applied, and stored ratcheted values must not linger in case a
            // future version applies them again. Cleared once here.
            if (learn.enemyTypeMul) delete learn.enemyTypeMul;
        } catch (e) { }
    }

    // v6.86.0 RESTART. Even with a deduped hof a CEM can converge into a bad
    // basin: sigma anneals to the floor, the mean welds in place, and every
    // later run is a +/-5% jitter around a policy that is merely locally best.
    // The measured store had all 24 sigmas at the floor with a flat median
    // across its last 600 runs. When exploration is dead AND the batch mean
    // has stopped improving, re-open the search (standard CMA restart): wide
    // sigma again, step size reset, path cleared, hof pruned to its best
    // entry so the next generation cannot be re-anchored by the same point.
    // The mean is KEPT — this re-explores around the current best guess, it
    // does not throw the tuning away.
    function sigmasAtFloor() {
        const c = learn.cem, keys = Object.keys(TUNABLE);
        let atFloor = 0, n = 0;
        for (const k of keys) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            if (!isFinite(c.sigma[k]) || range <= 0) continue;
            n++;
            if (c.sigma[k] <= range * CONFIG.learning.sigmaFloor * 1.02) atFloor++;
        }
        return n ? atFloor / n : 0;
    }
    function restartSearch(why) {
        const c = learn.cem;
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k];
            c.sigma[k] = (spec.max - spec.min) * CONFIG.learning.restartSigma;
        }
        c.ss = 1; c.pc = {}; c.batch = [];
        delete c.prevBatchMean;
        c.stall = 0;
        // v6.88.0 AUDIT D6: bestBatchMean is an ALL-TIME high-water mark and was
        // never reset here. Rewards are outlier-dominated by design (one
        // 250-minute run scores ~4.2 against a typical ~1.0), so a single deep
        // run pinned it permanently — after which maybeRestart saw every later
        // generation as not-improving, the stall counter climbed to the limit
        // unconditionally, and restartSearch fired on a permanent cycle,
        // pruning the hall of fame to one entry each time. Clearing it makes
        // "improvement" mean improvement since the restart, which is the only
        // thing the stall counter can sensibly measure.
        c.bestBatchMean = null;
        c.restarts = (c.restarts || 0) + 1;
        c.lastRestartRun = learn.runs;
        // keep only the single best entry: three near-identical elites are how
        // the search died in the first place
        learn.hof = learn.hof.slice(0, 1);
        log('CEM RESTART (' + why + ') — sigma reopened to ' + Math.round(CONFIG.learning.restartSigma * 100) +
            '% of range, hof pruned to best, restart #' + c.restarts);
        saveLearn();
        return { restarts: c.restarts, why: why, gen: c.gen, runs: learn.runs };
    }
    function maybeRestart(batchMean) {
        const c = learn.cem, L = CONFIG.learning;
        if (!L.autoRestart) return;
        const dead = sigmasAtFloor() >= 0.8;
        const improved = !isFinite(c.bestBatchMean) || batchMean > c.bestBatchMean + 1e-6;
        if (improved) c.bestBatchMean = batchMean;
        // a generation only counts as stalled when exploration is dead AND it
        // failed to beat the best batch this search has produced
        c.stall = (dead && !improved) ? (c.stall || 0) + 1 : 0;
        if (c.stall >= L.restartAfterStalledGens) restartSearch('stalled ' + c.stall + ' generations at the sigma floor');
    }

    function gauss() {
        let u = 0, v = 0;
        while (!u) u = Math.random();
        while (!v) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    function sampleParams() {
        // CMA-ES-lite sampling: diagonal Gaussian PLUS a rank-1 component
        // along the evolution path pc (the direction the mean has been
        // moving, in sigma units) — so correlated parameter moves that
        // worked keep being explored TOGETHER — all scaled by the adaptive
        // global step size ss.
        const c = learn.cem, out = {};
        const ss = isFinite(c.ss) ? c.ss : 1;
        const r1 = gauss();   // one shared draw drives the correlated component
        for (const k of Object.keys(TUNABLE)) {
            const s = TUNABLE[k];
            const pc = (c.pc && isFinite(c.pc[k])) ? c.pc[k] : 0;
            const step = ss * (gauss() * c.sigma[k] + 0.35 * r1 * pc * c.sigma[k]);
            out[k] = Math.min(s.max, Math.max(s.min, c.mean[k] + step));
        }
        return out;
    }

    function beginTrial() {
        // MULTI-TAB: re-read shared storage to pick up other tabs' progress
        // before this run counts itself in.
        learn = loadLearn();
        sanitizeCem();   // v6.85.23: purge NaN-poisoned CEM state + stale enemyTypeMul every trial
        repairCollapsedStore();   // v6.86.0: reopen a store that arrived already locked at the sigma floor
        learn.runs++;
        if (learn.runs <= CONFIG.learning.tuningWarmupRuns) {
            championRun = false;
            trialParams = { ...learn.cem.mean };        // warmup: play the current best estimate
        } else if (learn.runs % 4 === 0 && learn.hof.length) {
            // CHAMPION RUN: replay the all-time-best parameters exactly —
            // the best shot at a record, and a fresh audit of the champion.
            championRun = true;
            trialParams = { ...learn.hof[0].p };
        } else {
            championRun = false;
            trialParams = sampleParams();
        }
        applyParams(trialParams);
        saveLearn();
    }
    // v6.86.0 ONE-TIME REPAIR: a store that arrives already collapsed (every
    // sigma at the floor, duplicate hof entries) would otherwise need ~40
    // stalled generations before the auto-restart notices. Detect it once per
    // store on first load and reopen the search immediately.
    function repairCollapsedStore() {
        try {
            const c = learn && learn.cem;
            if (!c || !c.mean || c.repaired6860) return;
            c.repaired6860 = true;
            const dupes = (() => {
                let d = 0;
                for (let i = 0; i < learn.hof.length; i++)
                    for (let j = i + 1; j < learn.hof.length; j++)
                        if (paramDist(learn.hof[i].p, learn.hof[j].p) < CONFIG.learning.hofMergeDist) d++;
                return d;
            })();
            // always collapse duplicate hof entries into one (merging their
            // observations); the clones are what welded the refit in place
            if (dupes) {
                const kept = [];
                for (const h of learn.hof) {
                    const twin = kept.find(x => paramDist(x.p, h.p) < CONFIG.learning.hofMergeDist);
                    if (twin) {
                        twin.n = (twin.n || 1) + (h.n || 1);
                        twin.sum = (isFinite(twin.sum) ? twin.sum : twin.r) + (isFinite(h.sum) ? h.sum : h.r);
                        twin.r = +(twin.sum / twin.n).toFixed(4);
                        twin.best = Math.max(twin.best || twin.r, h.best || h.r);
                    } else kept.push(h);
                }
                learn.hof = kept;
                log('hof deduped: ' + dupes + ' duplicate pair(s) merged -> ' + kept.length + ' distinct vectors');
            }
            if (sigmasAtFloor() >= 0.8) restartSearch('collapsed store on load (' + dupes + ' duplicate hof entries)');
            else saveLearn();
        } catch (e) { }
    }
    // v6.86.0 HALL-OF-FAME REPAIR. Measured failure (6.85.23, n=3373): the
    // hof held FOUR distinct vectors in five slots because every 4th run
    // replays hof[0] and, scoring above the 5th slot, re-inserted its own
    // clone. refitCem takes hof.slice(0,3) as three of its five elites, so a
    // duplicated champion owned 60% of the refit; elite sd went to ~0 and all
    // 24 sigmas pinned to the floor. The search stopped searching at gen 425.
    // Two changes fix it structurally:
    //   1. entries are UNIQUE vectors (a near-duplicate merges instead of
    //      pushing), so three hof elites are always three real points;
    //   2. an entry scores on the MEAN of every run that played it, not on
    //      the single lucky draw that created it. A champion replay now
    //      RE-ESTIMATES the champion; a fluke demotes itself over a few
    //      replays instead of anchoring the refit forever.
    function paramDist(a, b) {
        // LARGEST normalised gap on any single dimension (Chebyshev), not the
        // mean: averaging over 24 dimensions would call two vectors identical
        // when one parameter differs by a seventh of its box, which is a
        // genuinely different policy. Two points are the same only when EVERY
        // dimension agrees.
        let worst = 0, n = 0;
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            const x = a && a[k], y = b && b[k];
            if (!isFinite(x) || !isFinite(y) || range <= 0) continue;
            worst = Math.max(worst, Math.abs(x - y) / range); n++;
        }
        return n ? worst : 1;
    }
    function hofRecord(reward, params) {
        const r = +reward.toFixed(4);
        // merge into the nearest entry if this vector is effectively the same
        let near = null, nearD = Infinity;
        for (const h of learn.hof) {
            const d = paramDist(h.p, params);
            if (d < nearD) { nearD = d; near = h; }
        }
        if (near && nearD < CONFIG.learning.hofMergeDist) {
            near.n = (near.n || 1) + 1;
            near.sum = (isFinite(near.sum) ? near.sum : near.r) + r;
            near.r = +(near.sum / near.n).toFixed(4);
            near.best = Math.max(isFinite(near.best) ? near.best : near.r, r);
        } else {
            learn.hof.push({ r, p: params, n: 1, sum: r, best: r });
        }
        // rank on the MEAN estimate, not on a single outlier run
        learn.hof.sort((a, b) => b.r - a.r);
        learn.hof = learn.hof.slice(0, 5);
    }
    function endTrial(reward) {
        if (!trialParams) return;
        const c = learn.cem;
        c.batch.push({ r: +reward.toFixed(4), p: trialParams, d: lastDeathCause, champ: championRun });
        // A champion replay carries no NEW vector — it is a fresh measurement
        // of one the hof already holds, so it updates that entry's mean and
        // can never clone it.
        hofRecord(reward, trialParams);
        trialParams = null;
        if (c.batch.length >= CONFIG.learning.batchSize) refitCem();
        applyParams(c.mean);
    }
    function refitCem() {
        const L = CONFIG.learning, c = learn.cem;
        const sorted = [...c.batch].sort((a, b) => b.r - a.r);
        const nElite = Math.max(2, Math.round(sorted.length * L.eliteFrac));
        // Refit toward this batch's best PLUS the all-time hall of fame, so
        // every generation is pulled by best-ever evidence, not just recent.
        const elites = sorted.slice(0, nElite).concat(learn.hof.slice(0, 3));
        if (!c.pc) c.pc = {};
        const oldMean = { ...c.mean };
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            const vals = elites.map(e => e.p && e.p[k]).filter(v => isFinite(v));
            if (!vals.length) continue;
            const m = vals.reduce((a, b) => a + b, 0) / vals.length;
            const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length);
            c.mean[k] = Math.min(spec.max, Math.max(spec.min, 0.3 * c.mean[k] + 0.7 * m));   // smoothed refit
            // Annealing: each generation explores a little less and exploits a
            // little more — iteration N+1 refines iteration N instead of
            // re-guessing it. The floor keeps it from ever going fully blind.
            c.sigma[k] = Math.max(range * L.sigmaFloor,
                Math.min(range * 0.35, (0.5 * c.sigma[k] + 0.5 * sd) * L.anneal));
        }
        // CMA-ES-lite: update the EVOLUTION PATH — the smoothed direction the
        // mean is travelling, in sigma units (scale-free). Future samples get
        // a correlated kick along this path, so parameters that improve
        // TOGETHER are explored together.
        for (const k of Object.keys(TUNABLE)) {
            const sg = Math.max(1e-9, c.sigma[k]);
            const delta = (c.mean[k] - oldMean[k]) / sg;
            const prev = isFinite(c.pc[k]) ? c.pc[k] : 0;
            c.pc[k] = Math.max(-3, Math.min(3, 0.8 * prev + 0.6 * delta));
        }

        // Record the improvement curve: mean reward of this generation's batch.
        const batchMean = c.batch.reduce((a, e) => a + e.r, 0) / c.batch.length;
        learn.genHistory.push(+batchMean.toFixed(4));
        if (learn.genHistory.length > 40) learn.genHistory.shift();

        // CMA-ES-lite: GLOBAL STEP-SIZE adaptation by success rule — a
        // generation that beat the last one earns a bigger exploration step;
        // a worse one shrinks it. Replaces blind annealing with feedback.
        if (!isFinite(c.ss)) c.ss = 1;
        if (isFinite(c.prevBatchMean)) {
            c.ss = batchMean > c.prevBatchMean
                ? Math.min(1.6, c.ss * 1.06)
                : Math.max(0.55, c.ss * 0.94);
        }
        c.prevBatchMean = batchMean;
        maybeRestart(batchMean);
        // Which hazard dominated this batch's deaths? Needed before the
        // gradient runs so its defence parameters can be shielded.
        const causeCount = {};
        for (const e of c.batch) if (e.d) causeCount[e.d] = (causeCount[e.d] || 0) + 1;
        let domCause = null, domN2 = 0;
        for (const k of Object.keys(causeCount)) if (causeCount[k] > domN2) { domN2 = causeCount[k]; domCause = k; }
        const domShare = c.batch.length ? domN2 / c.batch.length : 0;
        const domPool = domShare >= 0.4 ? DEATH_POOLS[domCause] : null;   // aligned with the nudge threshold

        // GRADIENT AUGMENTATION: elites say where the peak is; the FULL batch
        // says which way reward rises. A bounded correlation step per
        // parameter lets every run inform the move, not just the top 30%.
        const all = c.batch.concat(learn.hof.slice(0, 3));
        // v6.86.0: correlate against RANK, not raw reward. Survival time is
        // outlier-dominated (one 14000s run outweighs forty 900s runs), so a
        // Pearson step on raw reward fits whichever run got lucky with its
        // cocktail pool. Ranks make the gradient care about ordering only.
        const byR = [...all].sort((a, b) => a.r - b.r);
        const rankOf = new Map();
        byR.forEach((e, i) => rankOf.set(e, all.length > 1 ? i / (all.length - 1) - 0.5 : 0));
        for (const e of all) e._q = rankOf.get(e);
        const rMean = 0;
        const gradMoves = [];
        for (const k of Object.keys(TUNABLE)) {
            const spec = TUNABLE[k], range = spec.max - spec.min;
            let cov = 0, varP = 0, varR = 0;
            for (const e of all) {
                const pv = e.p && isFinite(e.p[k]) ? e.p[k] : null;
                if (pv == null) continue;
                const dp = pv - c.mean[k], dr = e._q - rMean;
                cov += dp * dr; varP += dp * dp; varR += dr * dr;
            }
            if (varP > 1e-9 && varR > 1e-9) {
                const corr = cov / Math.sqrt(varP * varR);   // -1..1
                let step = 0.04 * range * corr;
                // SHIELD: if one death cause dominates this batch, the
                // parameters that defend against it may not be eroded
                // further by the reward gradient (it optimises score, and
                // score is collected right up until the thing kills us).
                if (domPool && domPool.includes(k) && step < 0) step *= 0.25;
                c.mean[k] = Math.min(spec.max, Math.max(spec.min, c.mean[k] + step));
                gradMoves.push({ k, corr: +corr.toFixed(2), step: +step.toFixed(3) });
            }
        }
        // record the strongest gradient signals so the engine's reasoning is
        // visible in 🔍 diagnostics and the 📊 stats report
        gradMoves.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
        learn.lastGradient = { gen: c.gen + 1, samples: all.length, moves: gradMoves.slice(0, 6) };
        if (gradMoves.length) log('CEM gradient (gen ' + (c.gen + 1) + '):',
            gradMoves.slice(0, 3).map(m => m.k + (m.step > 0 ? ' +' : ' ') + m.step).join(', '));

        // Directed defense: if one hazard killed most of the batch, push the
        // parameters that guard against it.
        const causes = {};
        for (const e of c.batch) if (e.d) causes[e.d] = (causes[e.d] || 0) + 1;
        let dom = null, domN = 0;
        for (const k of Object.keys(causes)) if (causes[k] > domN) { domN = causes[k]; dom = k; }
        const pool = DEATH_POOLS[dom];
        if (pool && domN >= c.batch.length * 0.4) {
            // the nudge scales with dominance: a hazard causing 70%+ of
            // deaths gets a correction that can actually outrun the gradient
            const share = domN / Math.max(1, c.batch.length);
            const mag = L.deathNudge * (1 + 2 * Math.max(0, share - 0.4));
            for (const k of pool) {
                const spec = TUNABLE[k];
                c.mean[k] = Math.min(spec.max, c.mean[k] + (spec.max - spec.min) * mag);
            }
            log('CEM: defensive nudge against death by', dom, '(share', Math.round(share * 100) + '%, mag', mag.toFixed(3) + ')');
        }
        c.batch = [];
        c.gen++;
        log('CEM refit → generation', c.gen);
    }

    const DEATH_POOLS = {
        proj: ['threat.projWeight', 'threat.projLookaheadMs', 'movement.smoothing'],
        contact: ['threat.enemyWeight', 'movement.standoff', 'movement.standoffPull', 'threat.enemyRange', 'movement.panicHp'],
        mark: ['threat.markWeight', 'movement.lookaheadMs'],
        line: ['threat.lineWeight', 'movement.lookaheadMs'],
        rival: ['movement.escapePull', 'movement.lookaheadMs', 'movement.panicHp']
    };

    // Re-derive the rainbow roadmap from measured build performance. Greedy
    // pick of 6: measured mean dominates; a cocktail whose super-key is
    // already in the chosen set gets a big bonus (one maxed ingredient, two
    // supers); keys that pair into 2-part secret crafts with chosen keys get
    // craft-synergy bonuses. With no data yet it falls back to sane defaults.
    // ---- roster experiment bandit -----------------------------------
    function rosterCandidates() {
        const ids = [];
        if (CONFIG.userRoadmap && Array.isArray(CONFIG.userRoadmap.cocktails)) ids.push('user');
        ids.push('auto');
        ids.push(...Object.keys(ROSTER_FIXED));
        return ids;
    }
    function rosterStat(id) {
        const s = learn.rosters && learn.rosters[id];
        return (s && s.n > 0) ? { n: s.n, mean: s.sum / s.n } : null;
    }
    // Deterministic UCB over whole rosters. Unseen rosters get an optimistic
    // prior (recent baseline + a nudge) so each earns auditions; the user's
    // prescribed build carries a permanent incumbent edge, so ties and
    // no-data states always resolve to it.
    function rosterUcb(id) {
        const s = rosterStat(id);
        const total = Object.values(learn.rosters || {}).reduce((a, b) => a + (b.n || 0), 0) + 1;
        const mean = s ? s.mean : (baseline() ?? 0.8) + 0.05;
        let v = mean + CONFIG.learning.rosterExplore * Math.sqrt(Math.log(total + 1) / (1 + (s ? s.n : 0)));
        if (id === 'user') v += CONFIG.learning.rosterIncumbentEdge;
        return v;
    }
    function chooseRoster() {
        const ids = rosterCandidates();
        const incumbent = ids.includes('user') ? 'user' : 'auto';
        if (!CONFIG.rosterExperiment) return incumbent;
        // warmup runs and champion runs play the proven thing, not an audition
        const nextRun = (learn.runs || 0) + 1;
        if (nextRun <= CONFIG.learning.tuningWarmupRuns) return incumbent;
        if (nextRun % 4 === 0 && learn.hof.length) {
            let best = incumbent, bestM = -Infinity;
            for (const id of ids) {
                const s = rosterStat(id);
                if (s && s.n >= 2 && s.mean > bestM) { bestM = s.mean; best = id; }
            }
            return best;
        }
        let best = incumbent, bestV = -Infinity;
        for (const id of ids) {
            const v = rosterUcb(id);
            if (v > bestV) { bestV = v; best = id; }
        }
        return best;
    }

    function computeRoadmap() {
        activeRoster = chooseRoster();
        // The prescribed build — the incumbent — and the fixed experiment
        // rosters are literal plans; 'auto' falls through to self-composition.
        if (activeRoster === 'user' && CONFIG.userRoadmap && Array.isArray(CONFIG.userRoadmap.cocktails)) {
            // v6.87.0: the prescribed roster is PER CHARACTER. A tank and a
            // runner share a core (SOUTH SIDE / NEGRONI / OLIVE) and diverge
            // on everything else; running one plan for both meant Pat built
            // minguk's stall roster and could never reach VODKA MARTINI.
            // computeRoadmap() is called from beginTrial, after the bartender
            // for the run is chosen, so activeChar is already correct here.
            const cr = (CONFIG.charRoadmap || {})[activeChar];
            const plan = (cr && Array.isArray(cr.cocktails)) ? cr : CONFIG.userRoadmap;
            PLAN_COCKTAILS = plan.cocktails.slice();
            PLAN_INGREDIENTS = plan.ingredients.slice();
            return;
        }
        if (ROSTER_FIXED[activeRoster]) {
            PLAN_COCKTAILS = ROSTER_FIXED[activeRoster].cocktails.slice();
            PLAN_INGREDIENTS = ROSTER_FIXED[activeRoster].ingredients.slice();
            return;
        }
        const meanOf = c => {
            const b = learn.builds && learn.builds[c];
            return (b && b.n >= 3) ? b.sum / Math.max(1, b.n) : null;
        };
        const chosen = [], keys = new Set();
        // self-composition draws only from the user-approved cocktail list
        const pool = COCKTAILS.filter(c => !AVOID_COCKTAILS.has(c));
        const totalBuildRuns = Object.values(learn.builds || {}).reduce((a, b) => a + (b.n || 0), 0) + 1;
        while (chosen.length < 6 && pool.length) {
            let best = null, bestV = -Infinity;
            for (const c of pool) {
                const m = meanOf(c);
                let v = (m != null ? m : 0.85) * 100;      // measured performance dominates
                // exploration: under-tried builds earn audition slots (UCB),
                // shrinking as their sample grows — explore/exploit balance
                const bb = learn.builds && learn.builds[c];
                v += 18 * Math.sqrt(Math.log(totalBuildRuns + 1) / (1 + (bb ? bb.n : 0)));
                const k = SUPER_KEY_INGREDIENT[c];
                if (keys.has(k)) v += 40;                   // shared key: a super for free
                else {
                    for (const evo of EVOLUTIONS) {
                        if (!evo.parts.includes(k)) continue;
                        v += evo.parts.filter(p => keys.has(p)).length * 18;   // craft synergy
                        if (evo.parts.length === 2) v += 6;                    // cheap crafts preferred
                    }
                }
                if (v > bestV) { bestV = v; best = c; }
            }
            chosen.push(best);
            keys.add(SUPER_KEY_INGREDIENT[best]);
            pool.splice(pool.indexOf(best), 1);
        }
        PLAN_COCKTAILS = chosen;
        PLAN_INGREDIENTS = [...keys];
    }

    // Measured cocktail priority: once a build has real data (3+ runs), its
    // MEASURED mean replaces the hand-written static table on the same scale
    // (mean 1.2 → 30, mean 0.27 → 7). The static table only seeds unknowns.
    // This is what "optimal weapon choice" means at 900+ runs: the data
    // picks, not the guesses.
    function cocktailPriority(name) {
        const b = learn.builds && learn.builds[name];
        if (b && b.n >= 3) return Math.round((b.sum / b.n) * 25);
        return COCKTAIL_PRIORITY[name] || 20;
    }
    // Same principle for passives: measured item performance replaces the
    // static seed once 3+ runs of data exist (real data, augmented by the
    // recipe-book role bonuses added on top in scoreCard).
    function ingredientPriority(name) {
        const s = learn.items && learn.items[name];
        if (s && s.n >= 3) return Math.max(5, Math.min(40, Math.round((s.sum / s.n) * 20)));
        return INGREDIENT_PRIORITY[name] ?? 8;
    }

    // Build-level bandit: which PRIMARY cocktail actually produces long runs.
    function buildUcb(name) {
        const s = learn.builds[name];
        if (!s || !s.n) return 3;   // mild optimism for untried builds
        const mean = s.sum / s.n;
        const ref = baseline() ?? mean;
        return Math.max(-15, Math.min(15, (mean - ref) * 40)) +
            1.2 * Math.sqrt(Math.log(Math.max(2, learn.runs)) / s.n);
    }

    // =================================================================
    // CONTEXTUAL BANDIT (diagonal LinUCB) — the learned layer OVER the
    // hand-crafted card scores. Learns which picks pay off in which game
    // STATE (phase, HP, enemy mix, hell) from every logged run, instead of
    // one context-free mean per card. Bounded so recipe-book knowledge and
    // user directives always keep the casting vote.
    // =================================================================
    const CTX_D = 10;
    function pickContext() {
        const ph = gamePhase();
        const mixTotal = Math.max(1, enemyMix.total);
        return [
            1,                                            // bias
            ph === 'early' ? 1 : 0,
            ph === 'mid' ? 1 : 0,
            ph === 'late' ? 1 : 0,
            hellDetected ? 1 : 0,
            (() => { const p = G.player; if (!p) return 1; const m = p.maxHp || 100; return Math.max(0, Math.min(1, (p.hp ?? m) / m)); })(),
            Math.max(0, Math.min(1, dpsDeficit)),
            Math.min(1, enemyMix.boss / mixTotal * 4),    // boss share (scaled)
            Math.min(1, enemyMix.ranged / mixTotal * 3),  // ranged share (scaled)
            Math.min(1, passoutAvg / 3)                   // farm richness
        ];
    }
    function ctxLearnBonus(name, x) {
        const m = learn.linucb && learn.linucb[name];
        if (!m || !Array.isArray(m.A) || !Array.isArray(m.b)) return 0;
        const lam = 1, alpha = 1.2;
        let est = 0, unc = 0;
        for (let i = 0; i < CTX_D; i++) {
            const Ai = (isFinite(m.A[i]) ? m.A[i] : 0) + lam;
            const th = (isFinite(m.b[i]) ? m.b[i] : 0) / Ai;   // per-feature ridge estimate
            est += th * x[i];
            unc += (x[i] * x[i]) / Ai;
        }
        // reward scale ~0-2.5 -> score scale: x8, hard-bounded so the learned
        // layer nudges but never overrules the knowledge-based score
        const v = est * 8 + alpha * Math.sqrt(unc) * 2;
        return Math.max(-12, Math.min(12, Math.round(v * 10) / 10));
    }
    function creditLinUcb(reward) {
        const total = Math.max(1, runPickCtx.length);
        for (let i = 0; i < runPickCtx.length; i++) {
            const { name, x } = runPickCtx[i];
            const w = 1.5 - 0.5 * (i / total);   // early picks shape the run (same rule as the item bandit)
            const m = learn.linucb[name] || { n: 0, A: new Array(CTX_D).fill(0), b: new Array(CTX_D).fill(0) };
            for (let j = 0; j < CTX_D; j++) {
                m.A[j] = (isFinite(m.A[j]) ? m.A[j] : 0) * 0.999 + w * x[j] * x[j];
                m.b[j] = (isFinite(m.b[j]) ? m.b[j] : 0) * 0.999 + w * reward * x[j];
            }
            m.n = (m.n || 0) + w;
            learn.linucb[name] = m;
        }
    }

    // SPAWN TIMETABLE (source-extracted): boss/mob composition is gated on
    // set times (minute tiers at ~2 and ~4 min; the heavy boss band at
    // 480-680s; passout/no-booking density on gameTime/60-90 curves). The
    // 35s BEFORE each unlock is the prep window: buy damage and boss tools
    // so the new arrival converts to loot instead of a death.
    const BOSS_UNLOCK_S = [120, 240, 480, 540, 600, 680];   // source-extracted fallback
    function bossSchedule() {
        // MEASURED first: once 2+ runs have observed a boss class's arrival
        // time, the in-game data replaces the source-derived constants.
        const intel = learn.spawnIntel || {};
        const measured = Object.entries(intel)
            .filter(([k, v]) => /boss|nobook/i.test(k) && v.n >= 2)
            .map(([k, v]) => Math.round(v.sum / v.n))
            .sort((a, b) => a - b);
        return measured.length >= 3 ? measured : BOSS_UNLOCK_S;
    }
    function upcomingBossUnlock() {
        const gt = typeof G.gameTime === 'number' ? G.gameTime : 0;
        for (const t of bossSchedule()) if (gt < t && t - gt <= 35) return t;
        return 0;
    }

    // RAINBOW-OR-NOT (user directive): if a pure six-supers + consumable-
    // chaining run can reach the 126:43 crown, that path is worth exploring
    // too. When the gun is offered INSIDE the window, a two-arm bandit
    // chooses take-vs-skip from measured run rewards. 'take' starts with the
    // stronger prior (the 88:51 rainbow run is the best on record).
    function chooseRainbowPolicy() {
        if (CONFIG.rainbowPolicyOverride === 'take' || CONFIG.rainbowPolicyOverride === 'skip')
            return CONFIG.rainbowPolicyOverride;
        const P = learn.rainbowPolicy || {};
        const stat = a => (P[a] && P[a].n > 0) ? { n: P[a].n, mean: P[a].sum / P[a].n } : null;
        const total = ['take', 'skip'].reduce((x, a) => x + ((P[a] && P[a].n) || 0), 0) + 1;
        const score = a => {
            const st = stat(a);
            const prior = (baseline() ?? 0.9) + (a === 'take' ? 0.15 : 0.05);
            const mean = st ? st.mean : prior;
            return mean + 0.25 * Math.sqrt(Math.log(total + 1) / (1 + (st ? st.n : 0)));
        };
        return score('take') >= score('skip') ? 'take' : 'skip';
    }

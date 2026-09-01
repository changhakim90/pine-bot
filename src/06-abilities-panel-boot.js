
    function maybeAbilities(plan) {
        const now = Date.now();
        // v6.100.0 SPEED-INVARIANT ABILITY CLOCK: the dash and ult retry
        // gates are millisecond gates, and at a frame multiplier wall-ms run
        // slow against the game (one ult ask per ~200 game-seconds at 100x —
        // the 6.99.3/4 wreckage). Both gates now read GAME milliseconds when
        // gameTime exists; a stamp from a previous run (gameTime restarted)
        // resets to zero.
        const gtClk = safe(() => (typeof gameTime === 'number' ? gameTime : null), null);
        const clockMs = gtClk != null ? gtClk * 1000 : now;
        if (lastUlt > clockMs) lastUlt = 0;
        if (lastDash > clockMs) lastDash = 0;
        const A = CONFIG.abilities;
        // v6.101.0 THE CAP LADDER, RUNGS 2 AND 3. Stage 1 (the smother) is
        // pure movement and lives in 05. These two are game calls, so they
        // live here — the layer that owns them. They only ever run on a run
        // that is ALREADY past the cap and has already failed to die by
        // standing in the crowd, so neither can touch an ordinary run.
        if (plan.capStage >= 2) {
            // RUNG 2: the game's own damage function. hurtPlayer is a
            // top-level `function` declaration, so unlike the game's `let`
            // globals it really is on window (see the LEXICAL GLOBAL ACCESS
            // note). It sets invuln=38 frames itself, so a poke every half
            // game-second is already the maximum the game will honour.
            const gtH = safe(() => (typeof gameTime === 'number' ? gameTime : 0), 0) || 0;
            if (hasGame('hurtPlayer') && (gtH - capHurtAt >= 0.5 || gtH < capHurtAt)) {
                capHurtAt = gtH;
                callGame('hurtPlayer', 1e6);
            }
        }
        if (plan.capStage >= 3) {
            // RUNG 3: the guarantee. If the crowd would not kill us and the
            // game exposes no damage hook, the run still ENDS — booked
            // through the same finishRun() path a natural death uses (it is
            // idempotent, so a later real death cannot double-book it), then
            // navigated out so the unattended farm starts a fresh run. An
            // immortal build can no longer park a window for four hours.
            if (runActive) {
                deathSnapshot = deathSnapshot || snapshotStats();
                finishRun();
                setStatus('RUN CAP: booked by force at stage 3');
            }
            if (!capForcedThisRun) { capForcedThisRun = true; log('run cap: hard book + restart'); }
            releaseAll();
            callFirst(['backToTitle']);
            return;   // nothing else this tick — the run is over
        }
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
        // v6.96.2 (user): "it ... doesn't need to dash" past the run cap —
        // the dash is a 0.16 s escape burst, i.e. exactly the tool that keeps
        // carrying the bot OUT of the projectile paths that are supposed to
        // end the run. Holstered like the ult while the cap patrol walks.
        // v6.101.0 THE DASH HOLSTER GETS THE ULT'S BELT AND BRACES. The ult
        // gate below has ALWAYS carried its own `gtU >= runCapS` clock check
        // as well as reading plan.capDive; the dash gate read the plan alone.
        // So any tick whose plan lacked the flag re-armed the dash past the
        // cap while the ult stayed correctly holstered — and one dash is not
        // cosmetic here: it is a 0.16 s movement burst that BREAKS the
        // sustained contact the kill depends on and resets the ~36 s clock.
        // The user watched exactly this ("using dashes even after when it's
        // supposed to just get constant contact damage"). Now both gates
        // answer the same question the same way.
        const gtDash = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const capHolster = plan.capDive === true ||
            ((CONFIG.deepHell.runCapS || 0) > 0 && gtDash >= CONFIG.deepHell.runCapS);
        if (!capHolster && A.dashEnabled && dashProductive && hasGame('tryDash') && clockMs - lastDash > dashGate &&
            (plan.danger > dashThreshold || inBlastZone || plan.projImminent || plan.laneUrgent ||
                plan.rivalUrgent || plan.frozenUrgent || plan.sprinterUrgent || plan.contactImminent ||
                plan.flight || blastImminent)) {
            lastDash = clockMs;
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
        // v6.111.0: the day retry drops to a flat ultDayRetryMs (1500) rather
        // than 0.6x the 2500 ms base (1500 — the same number, now named and
        // configurable). Stated plainly because this session nearly shipped a
        // much bigger change here: the retry gate is NOT the ult lever. The
        // game's own cooldown is ULT_CD 80 s x ultCdMul, so tightening the
        // retry only shaves the lag between that cooldown expiring and the bot
        // noticing — worth about 1% of casts. The levers are ult LEVEL (window
        // length) and ultCdMul, and both are bought at the level-up screen.
        let ultGate = (gtU < 1200 && !hellDetected)
            ? (A.ultDayRetryMs != null ? A.ultDayRetryMs : A.ultCooldownMs * 0.6)
            : A.ultCooldownMs;
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
        // v6.96.0 THE RUN CAP: past runCapS the movement layer is walking the
        // bot into the crowd to die on purpose (see the config comment). The
        // ult's invulnerability window — pat's spiral, joe's Untouchable — is
        // the one tool that could carry a full build through that dive alive,
        // so past the cap it stays holstered no matter what else is true.
        // This deliberately outranks ultAlways, ultChain and every emergency
        // clause: they all serve survival, and survival is no longer the job.
        // v6.99.3: the movement layer's plan carries the EARLY cap (the
        // stability-proof latch) — honor it here too, or the ult would carry
        // an early-capped build through its own patrol.
        const capDive = ((DH.runCapS || 0) > 0 && gtU >= DH.runCapS) || plan.capDive === true;
        if (!capDive && A.ultEnabled && hasGame('useUltimate') && clockMs - lastUlt > ultGate &&
            (plan.near >= A.ultCrowd || plan.hpRatio < A.ultHpRatio ||
                defensive || offensive || emergency || entryHold || surgeCrowd || harvest || lootTargets || linebackerBurst || scalingMobs || ultSpam || contactSave || survivalUlt ||
                ultChain || ultAlways)) {   // v6.88.2: deep + invuln ult = fire, unconditionally
            lastUlt = clockMs;
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
            // v6.108.0 SPEED SAMPLE — game-seconds advanced per wall-second.
            // 1.0 is a healthy page; the measured stall ran at 0.021, i.e.
            // 358 game-seconds across 4.8 wall-HOURS. Every 5 wall-seconds,
            // and only while a run is live so title screens do not dilute it.
            if (runActive) {
                const gtS = safe(() => (typeof gameTime === 'number' ? gameTime : null), null);
                if (gtS != null) {
                    if (spdLastGt == null || gtS < spdLastGt) { spdLastGt = gtS; spdLastWall = now; }
                    else if (now - spdLastWall >= 5000) {
                        const sp = (gtS - spdLastGt) / ((now - spdLastWall) / 1000);
                        if (isFinite(sp)) {
                            spdSamples.push(+sp.toFixed(3));
                            if (spdSamples.length > 400) spdSamples.shift();
                            if (spdWorst == null || sp < spdWorst) spdWorst = +sp.toFixed(3);
                        }
                        spdLastGt = gtS; spdLastWall = now;
                    }
                }
            }

            if (now - lastOverlay >= CONFIG.overlayMs) {
                lastOverlay = now;
                handleScreens();
                if (!running) return;   // a handler may have stopped us (hell record)
            }

            // v6.100.0 SPEED-INVARIANT TICK: plan every tickMs of GAME time.
            // Under the frame multiplier this loop is itself called once per
            // VIRTUAL frame (rAF is multiplied), so gating on gameTime keeps
            // the per-game-second planning cadence identical at any speed.
            // The wall clock (250 ms) stays as the keep-alive for pauses and
            // states where gameTime is frozen or absent.
            const gtL = safe(() => (typeof gameTime === 'number' ? gameTime : null), null);
            const gtDue = gtL != null && (gtL < lastTickGt || gtL - lastTickGt >= CONFIG.tickMs / 1000);
            const wallDue = now - lastTick >= (gtL != null ? Math.max(CONFIG.tickMs, 250) : CONFIG.tickMs);
            if (gtDue || wallDue) {
                lastTick = now;
                if (gtL != null) lastTickGt = gtL;
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
        lastTick = 0; lastOverlay = 0; lastTickGt = 0;
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
    // v6.104.0 REBUILT FOR PEOPLE WHO ARE NOT ME (user: "more ux friendly
    // for other users to start the bot, stop the bot, hide the overlay").
    // Five controls, no jargon on the face of it, and the two destructive
    // ones removed outright: RESET wiped the learning store on a single
    // misclick, and DIAG/SNAP duplicated things the report already carries.
    // Both survive as console calls (pineBot.reset(), pineBot.diagnose()).
    // =================================================================
    let statusEl = null, infoEl = null, panelEl = null, restoreEl = null;
    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

    const PANEL_HIDE_KEY = 'pineBotPanelHidden';
    const mmss = s2 => {
        const v = Math.max(0, Math.round(s2 || 0));
        return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
    };

    // v6.104.0 (user): "have the auto-kill protocol be able to be initiated
    // from it". Latching capEarly is the whole implementation — the tested
    // ladder (smother -> hurtPlayer at capStandS -> hard book + restart at
    // capForceS) then runs exactly as it does for a proven-immortal build,
    // so the run BOOKS and the farm carries on. Deliberately NOT endRun(),
    // which books the row but also stops the bot and needs a human to
    // restart it.
    function killNow() {
        if (!runActive) { setStatus('no run in progress'); return 'no run in progress'; }
        capEarly = true;
        setStatus('KILL PROTOCOL engaged — ending this run');
        log('kill protocol engaged from the panel');
        return 'kill protocol engaged';
    }

    function pbBtn(label, o) {
        o = o || {};
        const b = document.createElement('button');
        b.textContent = label;
        if (o.title) b.title = o.title;
        b.style.cssText = [
            'cursor:pointer', 'border:0', 'border-radius:6px', 'margin:0',
            'padding:' + (o.pad || '6px 10px'),
            'font:inherit', 'font-weight:700', 'letter-spacing:.2px',
            'background:' + (o.bg || 'rgba(255,255,255,.09)'),
            'color:' + (o.fg || '#e8e8ef'),
            'transition:filter .12s', 'white-space:nowrap',
            o.grow ? 'flex:1 1 0' : 'flex:0 0 auto'
        ].join(';');
        b.onmouseenter = () => { b.style.filter = 'brightness(1.4)'; };
        b.onmouseleave = () => { b.style.filter = 'none'; };
        return b;
    }
    function pbRow(gap) {
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;gap:' + (gap || 5) + 'px;margin-bottom:6px';
        return d;
    }

    function setPanelHidden(hide) {
        if (panelEl) panelEl.style.display = hide ? 'none' : 'block';
        if (restoreEl) restoreEl.style.display = hide ? 'block' : 'none';
        try { localStorage.setItem(PANEL_HIDE_KEY, hide ? '1' : '0'); } catch (e) { }
    }

    function buildPanel() {
        if (!document.body || document.getElementById('pineBotPanel')) return;

        // The restore chip. Hiding the overlay must never be a one-way door,
        // so this is created FIRST and lives independently of the panel.
        restoreEl = pbBtn('🍸', { title: 'Show the Pine Bot panel', pad: '7px 9px', bg: 'rgba(16,16,22,.85)', fg: '#ffd98a' });
        restoreEl.style.cssText += ';position:fixed;right:10px;bottom:10px;z-index:2147483647;' +
            'box-shadow:0 3px 12px rgba(0,0,0,.4);display:none;font-size:15px';
        restoreEl.onclick = () => setPanelHidden(false);
        document.body.appendChild(restoreEl);

        const el = document.createElement('div');
        panelEl = el;
        el.id = 'pineBotPanel';
        el.style.cssText = [
            'position:fixed', 'right:10px', 'top:50%', 'transform:translateY(-50%)', 'z-index:2147483647',
            'background:rgba(16,16,22,.62)', 'color:#eee', 'font:11px/1.45 ui-monospace,Menlo,monospace',
            'padding:10px', 'border-radius:10px', 'width:232px', 'opacity:.8',
            'transition:opacity .15s,background .15s',
            'border:1px solid rgba(58,58,70,.6)', 'box-shadow:0 4px 18px rgba(0,0,0,.35)', 'user-select:none'
        ].join(';');
        el.onmouseenter = () => { el.style.opacity = '1'; el.style.background = 'rgba(16,16,22,.96)'; };
        el.onmouseleave = () => { el.style.opacity = '.8'; el.style.background = 'rgba(16,16,22,.62)'; };

        // ── header: name + hide ──────────────────────────────────────────
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;margin-bottom:8px';
        const title = document.createElement('div');
        title.textContent = '🍸 Pine Bot v' + scriptTag();
        title.style.cssText = 'font-weight:700;color:#ffd98a;flex:1 1 auto';
        const hideBtn = pbBtn('–', { title: 'Hide this panel (a 🍸 button appears bottom-right to bring it back)', pad: '2px 8px' });
        hideBtn.onclick = () => setPanelHidden(true);
        head.appendChild(title); head.appendChild(hideBtn);
        el.appendChild(head);

        // ── row 1: the two controls almost everyone wants ────────────────
        const r1 = pbRow();
        const startBtn = pbBtn('▶ Start', { title: 'Let the bot play', grow: true, bg: 'rgba(64,170,110,.85)', fg: '#eafff2' });
        const stopBtn = pbBtn('■ Stop', { title: 'Hand control back to you', grow: true, bg: 'rgba(190,70,70,.85)', fg: '#ffecec' });
        startBtn.onclick = () => startBot();
        stopBtn.onclick = () => stopBot();
        r1.appendChild(startBtn); r1.appendChild(stopBtn);
        el.appendChild(r1);

        // ── row 2: end run / report / record ─────────────────────────────
        const r2 = pbRow();
        const killBtn = pbBtn('⏻ End Run', {
            title: 'Run the auto-kill protocol now: the bot walks into the crowd, the run is scored and saved, and the next run starts automatically',
            grow: true
        });
        let killArmed = 0;
        killBtn.onclick = () => {
            const t = Date.now();
            if (t - killArmed > 3000) {          // two-step: one click never ends a run
                killArmed = t;
                killBtn.textContent = '⏻ Sure?';
                killBtn.style.background = 'rgba(220,140,50,.9)';
                setTimeout(() => {
                    if (Date.now() - killArmed >= 3000) {
                        killBtn.textContent = '⏻ End Run';
                        killBtn.style.background = 'rgba(255,255,255,.09)';
                    }
                }, 3100);
                return;
            }
            killArmed = 0;
            killBtn.textContent = '⏻ End Run';
            killBtn.style.background = 'rgba(255,255,255,.09)';
            killNow();
        };
        // v6.113.0: the report overlay is now the ONLY thing needed — it opens
        // with the headline numbers rendered above the JSON, the text
        // pre-selected, and a copy button that tells the truth about whether
        // it worked. Nothing here should ever require a console.
        const repBtn = pbBtn('📋', { title: 'Full report — every audit, summary on top, opens pre-selected. Copy and paste it to Claude.' });
        repBtn.onclick = () => {
            const r = safe(() => window.pineBot.report(), null);
            showReport(r || buildStatsReport());
        };
        const recBtn = pbBtn('🎥', { title: 'Record YOUR manual play as a teaching demo — click once to start, again to save' });
        recBtn.onclick = () => {
            demoToggle();
            const on = !!demoRec;
            recBtn.style.background = on ? 'rgba(210,60,60,.9)' : 'rgba(255,255,255,.09)';
            recBtn.textContent = on ? '⏺' : '🎥';
        };
        r2.appendChild(killBtn); r2.appendChild(repBtn); r2.appendChild(recBtn);
        el.appendChild(r2);

        // ── status + live info ───────────────────────────────────────────
        const stWrap = document.createElement('div');
        stWrap.style.cssText = 'border-top:1px solid rgba(255,255,255,.09);padding-top:6px';
        statusEl = document.createElement('div');
        statusEl.textContent = 'idle';
        statusEl.style.cssText = 'color:#8fd;margin-bottom:4px';
        infoEl = document.createElement('div');
        infoEl.style.cssText = 'color:#aab';
        stWrap.appendChild(statusEl); stWrap.appendChild(infoEl);
        el.appendChild(stWrap);

        document.body.appendChild(el);
        try { if (localStorage.getItem(PANEL_HIDE_KEY) === '1') setPanelHidden(true); } catch (e) { }
        setInterval(demoTick, 160);

        setInterval(() => {
            if (!infoEl) return;
            const st = G.state;
            const p = lastPlan;
            const gt = safe(() => gameTime, null);
            const vs = (learn.versions || {})[scriptTag()];
            // v6.88.0 AUDIT S1 STILL APPLIES: `lastAction` is built from a
            // clicked element's textContent, and the stuck-breaker clicks by
            // TEXT, so a leaderboard row carrying another player's display
            // name can reach this line. Every page-derived value goes in as a
            // TEXT NODE — never innerHTML, never string-concatenated markup.
            const rows = [];
            if (document.hidden === true) {
                rows.push(['⚠ background tab — the game is frozen here; keep this window visible', '#f9a']);
            }
            if (st === 'playing' && typeof gt === 'number') {
                rows.push([(hellDetected ? '🔥 hell  ' : '☀ day  ') + mmss(gt), '#cfe']);
            } else {
                rows.push([String(st == null ? 'waiting…' : st), '#cfe']);
            }
            rows.push([(primaryCocktail || 'no build yet') + '  ·  ' + runPicks.length + ' picks' +
                (supersThisRun ? '  ·  ' + supersThisRun + ' supers' : ''), '#aab']);
            // the ladder, but only while it is actually doing something
            if (p && p.capStage) {
                rows.push(['⚡ KILL PROTOCOL — stage ' + p.capStage +
                    (capFirstGt != null && typeof gt === 'number' ? '  ·  ' + Math.round(gt - capFirstGt) + 's' : ''), '#fc8']);
            }
            rows.push([learn.runs + ' runs total' +
                (vs && vs.n ? '  ·  this build ' + vs.n + ', best ' + Math.round(vs.bestT / 60) + 'm' : ''), '#889']);
            rows.push(['gen ' + learn.cem.gen + ' (' + learn.cem.batch.length + '/' + CONFIG.learning.batchSize + ')' +
                (championRun ? ' 👑' : '') + (lastDeathCause ? '  died→' + lastDeathCause : ''), '#778']);
            if (p && p.diag) rows.push([String(p.diag), '#667']);
            infoEl.textContent = '';
            for (const r of rows) {
                const line = document.createElement('div');
                line.textContent = r[0];
                line.style.color = r[1];
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

    // ── v6.113.0 THE REPORT IS THE PRODUCT, AND IT LIED ABOUT COPYING ───────
    //
    // USER: "I want this all done by the report on the UI overlay. Everything
    // you need should not require things from the console."
    //
    // The 📋 button has existed since 6.8x and the user still pastes from the
    // console, which the release-state doc calls "the slow part of every
    // session". Reading the old handler says why:
    //
    //     copy.onclick = () => { try { navigator.clipboard.writeText(...);
    //                                  copy.textContent = 'copied'; } catch(e){} }
    //
    // `writeText` is ASYNC. It returns a promise, and a rejection — denied
    // permission, an unfocused document, a non-secure context — never reaches
    // that catch. The label was set on the next synchronous line regardless.
    // So the button said "copied" every single time, including the times
    // nothing was on the clipboard. A silent failure that reports success is
    // worse than a loud one: it sends you to the console without ever saying
    // it failed.
    //
    // Three fixes, in order of how much they matter:
    //   1. TELL THE TRUTH. Await the promise; fall back to execCommand on a
    //      real <textarea>; if even that fails, select the text and say
    //      "press ⌘C" — never claim a copy that did not happen.
    //   2. <textarea>, not <pre>. A pre cannot be .select()ed, so there was no
    //      manual path at all when the clipboard was unavailable. A readonly
    //      textarea gives one, and renders 200 KB far faster.
    //   3. A HUMAN SUMMARY ON TOP. The point of an overlay report is to be
    //      read, not only shipped. The headline numbers now render above the
    //      JSON so the run state is legible without copying anything.
    function reportSummary(r) {
        // Pure function of the report object — no DOM, no globals — so it is
        // testable and so the panel and the console print the same thing.
        const L = [];
        const n = v => (v == null ? '—' : v);
        const pct = v => (v == null ? '—' : Math.round(v * 100) + '%');
        try {
            // v6.114.0: `compare.current` is a STRING ("6.113.0+crown+joe"),
            // not a row. The first draft read `.version`/`.n` off it and the
            // header rendered "v—  —  n=—" on the very first live paste. The
            // row lives in compare.versions; find it by that string.
            const cmp = (r && r.compare) || {};
            const curId = typeof cmp.current === 'string' ? cmp.current : null;
            const vers = Array.isArray(cmp.versions) ? cmp.versions : [];
            const cur = (curId && vers.filter(v => v && v.version === curId)[0]) ||
                        (typeof cmp.current === 'object' && cmp.current) || {};
            L.push('v' + n(curId || cur.version) +
                '  n=' + n(cur.runs != null ? cur.runs : cur.n) +
                '  gen=' + n(r && r.learning && r.learning.gen) +
                '  runs=' + n(r && r.learning && r.learning.runs));
            const g = (r && r.funnel && r.funnel.groups && r.funnel.groups[0]) || {};
            L.push('FUNNEL  day ' + n(g.dayClearRate) + '   entry ' + n(g.entrySurvival) +
                '   deepHeld ' + n(g.deepHeldRate) + '   seated ' + n(g.seatedRate));
            L.push('BUILD   ready ' + n(g.buildsReady) + '@' + n(g.medianReadyAt) +
                '   supers/run ' + n(cur.supersPerRun) +
                '   entryDef ' + n(g.medianEntryDef) + '   entryRegen ' + n(g.medianEntryRegen));
            L.push('DEEP    at ' + n(g.medianDeepAt) + '   bestHold ' + n(g.medianDeepHold) + 's' +
                '   still ' + n(g.medianDeepStill) + '%   ult ' + n(g.medianDeepInv) + '%   hp ' + n(g.medianDeepHp));
            if (g.holds) L.push('        holds ' + n(g.holds) + '  median ' + n(g.medianHold) + 's  max ' + n(g.maxHold) +
                's  broke-by ' + (g.deepBreak ? Object.keys(g.deepBreak).map(k => k + ':' + g.deepBreak[k]).join(' ') : '-'));
            // v6.116.0: the seat census. The line that says what is standing
            // between "in hell" and "anchored", sorted biggest-first — which
            // is the version-to-version target while deepHeldRate is 0.
            if (g.seatShare != null) {
                const ms = g.parkMiss || {};
                const mr = Object.keys(ms).map(k => [k, ms[k]]).sort((a, b) => b[1] - a[1]);
                const mt = mr.reduce((s, x) => s + x[1], 0) || 1;
                L.push('SEAT    held ' + n(Math.round(g.seatShare * 100)) + '% of hell   missed-by ' +
                    (mr.length ? mr.slice(0, 6).map(x => x[0] + ' ' + Math.round(x[1] / mt * 100) + '%').join('  ') : '-'));
            }
            L.push('SURVIVE median ' + n(cur.medianTimeS) + 's   mean ' + n(cur.meanTimeS) +
                's   hell ' + n(cur.hellRate) + '   caps ' + n(g.capOuts) + '/' + n(g.earlyCaps));
            // v6.114.0 THE HP ECONOMY, promoted to the headline. The income
            // audit's first bucket is the single most diagnostic number in the
            // report and it was buried: a negative net at minute 0 means the
            // pool drains from the start and no amount of movement tuning can
            // fix it. `firstNeg` is the first depth at which the bot is losing.
            const inc = (r && r.income && r.income.buckets) || [];
            if (inc.length) {
                const b0 = inc[0] || {};
                L.push('HP NET  0-10min ' + (b0.net > 0 ? '+' : '') + n(b0.net) + ' HP/s  (loss ' + n(b0.lossPerSec) +
                    ' gain ' + n(b0.gainPerSec) + ')   firstNegative@' + n(r.income.firstNegativeMin) + 'min' +
                    (b0.net < 0 ? '   <-- DRAINING FROM MINUTE ZERO' : ''));
            }
            // deaths, biggest first — the line that says what to fix next
            const d = (r && r.funnel && r.funnel.groups && r.funnel.groups[0] && r.funnel.groups[0].deaths) || null;
            const dmg = (r && r.damage && r.damage.sole) || null;
            if (dmg) {
                const rows = Object.keys(dmg).map(k => [k, dmg[k].n || 0]).sort((a, b) => b[1] - a[1]);
                const tot = rows.reduce((s, x) => s + x[1], 0) || 1;
                L.push('DAMAGE  ' + rows.slice(0, 5).map(x => x[0] + ' ' + Math.round(x[1] / tot * 100) + '%').join('  '));
            } else if (d) {
                L.push('DEATHS  ' + Object.keys(d).map(k => k + ' ' + d[k]).join('  '));
            }
            // the two v6.111/112 instruments, so a row that is not moving says so
            L.push('LANES   in ' + n(g.laneIn) + '  divert ' + n(g.laneDiv) +
                '        ULT  invAll ' + n(g.medianInvAll) + '  casts ' + n(g.medianCasts) + '  cdMul ' + n(g.medianCdMul));
            // v6.118.0: the craft prompt, one line. The user reports BLACK
            // VERMOUTH never triggering; this says which half of the chain.
            const cr = r && r.craft;
            if (cr && (cr.ready || cr.seen)) {
                L.push('CRAFT   owed ' + n(cr.ready) + '  promptSeen ' + n(cr.seen) +
                    '  clicked ' + n(cr.clicked) + '  confirmed ' + n(cr.confirmed) +
                    (cr.ready > 100 && !cr.seen ? '   <-- OWED BUT NEVER PROMPTED' : '') +
                    (cr.seen && !cr.clicked ? '   <-- PROMPTED BUT NO SELECTOR MATCHED' : ''));
            }
            const bk = (r && r.boss && r.boss.kinds) || [];
            if (bk.length) {
                L.push('BOSS    ' + bk.slice(0, 4).map(k =>
                    k.kind + ' n' + k.n + ' @' + n(k.firstGt) + ' r' + n(k.r0) + ' ring@' + n(k.ringAt)).join('  |  '));
            } else {
                L.push('BOSS    census empty — run a batch on 6.112.0+');
            }
            // CEM dimensions pinned against a bound, which is the thing that
            // most often explains a flat row and is invisible in the numbers.
            const par = (r && r.learning && r.learning.params) || {};
            const edge = Object.keys(par).filter(k => par[k] && par[k].atEdge);
            if (edge.length) L.push('AT EDGE ' + edge.map(k => k.split('.').pop() + ':' + par[k].atEdge).join('  '));
            // v6.117.0: `reopen` is `cem.lastReopen` — a DURABLE record of the
            // last migration, not an event on this load. The old wording said
            // "re-opened this load" and would have had the next reader chasing
            // a phantom restart 3,400 runs after the fact. Print WHEN.
            const reop = r && r.learning && r.learning.reopen;
            if (reop && reop.dims && reop.dims.length) {
                const now = (r && r.learning && r.learning.runs) || 0;
                const ago = reop.runs != null ? (now - reop.runs) : null;
                L.push('REOPEN  last box re-open: ' + reop.dims.length + ' dim(s) at run ' + n(reop.runs) +
                    (ago != null ? '  (' + ago + ' runs ago)' : '') +
                    (ago != null && ago > 200 ? '  — history, not this load' : ''));
            }
        } catch (e) {
            L.push('(summary failed: ' + (e && e.message) + ')');
        }
        void pct;
        return L.join('\n');
    }

    function showReport(report) {
        const old = document.getElementById('pineBotReport');
        if (old) old.remove();
        const text = (() => { try { return JSON.stringify(report, null, 2); } catch (e) { return '{}'; } })();
        const kb = Math.round(text.length / 1024);
        const el = document.createElement('div');
        el.id = 'pineBotReport';
        el.style.cssText = 'position:fixed;left:10px;top:10px;right:250px;max-height:80vh;overflow:auto;z-index:2147483647;' +
            'background:rgba(10,10,14,.97);color:#cfe;font:10px/1.4 ui-monospace,monospace;padding:10px;border-radius:8px;border:1px solid #3a3a46';

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px';
        const mk = (label, title) => {
            const b = document.createElement('button');
            b.textContent = label; b.title = title || '';
            b.style.cssText = 'cursor:pointer;font:11px ui-monospace,monospace;padding:3px 9px;border-radius:5px;' +
                'border:1px solid #4a4a58;background:rgba(255,255,255,.09);color:#ffd98a';
            return b;
        };
        const ta = document.createElement('textarea');
        ta.readOnly = true;
        ta.value = text;
        ta.style.cssText = 'width:100%;height:46vh;background:rgba(0,0,0,.5);color:#cfe;border:1px solid #333;' +
            'border-radius:6px;font:10px/1.35 ui-monospace,monospace;padding:6px;resize:vertical';

        const copy = mk('📋 copy report (' + kb + ' KB)', 'Copies the whole report. Paste it straight to Claude.');
        const say = (msg, good) => { copy.textContent = msg; copy.style.color = good ? '#9f9' : '#f99'; };
        // The honest chain: clipboard API -> execCommand on the textarea ->
        // select and tell the user to press the key. Each step only claims
        // success after it has actually happened.
        copy.onclick = () => {
            // Each step guarded SEPARATELY. One try block around the lot meant
            // a throwing select() — an older engine, a detached node — skipped
            // execCommand entirely and lost the last working copy path. The
            // selection is a nicety; the execCommand call is the fallback, and
            // it must be attempted even when the selection could not be made.
            const viaExec = () => {
                try { ta.readOnly = false; } catch (e) { }
                try { if (ta.select) ta.select(); } catch (e) { }
                try { if (ta.setSelectionRange) ta.setSelectionRange(0, text.length); } catch (e) { }
                let ok = false;
                try { ok = !!(document.execCommand && document.execCommand('copy')); } catch (e) { }
                try { ta.readOnly = true; } catch (e) { }
                if (ok) { say('✓ copied — paste to Claude', true); return true; }
                return false;
            };
            let p = null;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) p = navigator.clipboard.writeText(text);
            } catch (e) { p = null; }
            if (p && typeof p.then === 'function') {
                p.then(() => say('✓ copied — paste to Claude', true))
                 .catch(() => { if (!viaExec()) { try { ta.select(); } catch (e) { } say('press ⌘C / Ctrl+C now', false); } });
            } else if (!viaExec()) {
                try { ta.select(); } catch (e) { }
                say('press ⌘C / Ctrl+C now', false);
            }
        };
        const sel = mk('select all', 'Select the text so you can copy it by hand');
        sel.onclick = () => { try { ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); } catch (e) { } };
        const close = mk('close', 'Close this overlay');
        close.onclick = () => el.remove();
        bar.appendChild(copy); bar.appendChild(sel); bar.appendChild(close);

        const sum = document.createElement('pre');
        sum.textContent = reportSummary(report);
        sum.style.cssText = 'margin:0 0 8px;padding:8px;background:rgba(255,217,138,.07);border-left:2px solid #ffd98a;' +
            'color:#ffe7b8;font:11px/1.5 ui-monospace,monospace;white-space:pre;overflow-x:auto';

        el.appendChild(bar);
        el.appendChild(sum);
        el.appendChild(ta);
        document.body.appendChild(el);
        // Pre-select on open: even if every clipboard path is blocked, one
        // keystroke ships the report. This is the fallback that makes the
        // console unnecessary rather than merely inconvenient.
        try { ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); } catch (e) { }
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
            // v6.96.2 SIZE CAP. "Last 4 runs" was the only bound, and four
            // 20-minute demos measured 2.66 MB — 91% of the bot's whole
            // storage footprint, crowding the quota every learn-store save
            // has to fit under. Bytes, not count, are the real budget: drop
            // oldest demos until the blob fits, and if a SINGLE demo is over
            // the cap, thin its sample ring (every 2nd sample; the digest's
            // percentiles barely move) rather than refuse the save.
            const demoCap = (CONFIG.learning && CONFIG.learning.demoCapBytes) || 900000;
            let demoBlob = JSON.stringify(all);
            while (all.length > 1 && demoBlob.length > demoCap) { all.shift(); demoBlob = JSON.stringify(all); }
            while (demoBlob.length > demoCap && all.length === 1 && (all[0].samples || []).length > 500) {
                all[0].samples = all[0].samples.filter((_, i) => i % 2 === 0);
                all[0].thinned = (all[0].thinned || 0) + 1;
                demoBlob = JSON.stringify(all);
            }
            localStorage.setItem('pineBotDemos', demoBlob);
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
            },
            // v6.109.0 THE FINAL STATE — the point of a recording that STOPS
            // at corner anchoring. Everything above is a distribution over the
            // whole run; this is the single snapshot that says what the
            // immortal build actually was, and when it arrived.
            final: (() => {
                const L = S[S.length - 1], tail = S.slice(-Math.min(60, S.length));
                const pctT = q => pct(tail.map(x => x.cnr).filter(v => v != null), q);
                return {
                    gt: L.gt,                                   // time to immortality
                    def: L.def, regen: L.rgn, ultLv: L.ulv, supers: L.sup,
                    weapons: L.w || null, passives: L.pas || null,
                    // the anchoring claim, checked rather than asserted:
                    // corner distance and HP over the final stretch
                    tailCornerDist: { p25: pctT(0.25), median: pctT(0.5), p75: pctT(0.75) },
                    tailHpMedian: pct(tail.map(x => x.hp), 0.5),
                    tailInvulnShare: +(tail.reduce((n, x) => n + (x.inv || 0), 0) / tail.length).toFixed(3),
                    tailCrowdMedian: pct(tail.map(x => x.near), 0.5)
                };
            })()
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
            ol: (p.weapons || {}).olive || 0, ng: (p.weapons || {}).negroni || 0,
            // v6.109.0 — THE IMMORTAL-BUILD RECORDING. The user records to the
            // moment of corner anchoring and stops, per character, so the LAST
            // sample is the answer: this is what an immortal build is made of.
            // def and rgn are recorded because the bot's own stability proof
            // gates on them (capStable.defMin 34.9, and the whole armour
            // doctrine) using numbers derived from source reading, never from
            // a human's actual immortal build.
            def: typeof p.defense === 'number' ? +p.defense.toFixed(1) : null,
            rgn: typeof p.regenBonus === 'number' ? +p.regenBonus.toFixed(2) : null,
            // full owned levels, so the final sample names the recipe rather
            // than leaving it to be reconstructed from a 60-pick cap
            w: Object.assign({}, p.weapons || {}), pas: Object.assign({}, p.passives || {})
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
                // v6.104.0: the panel's ⏻ End Run, callable from the console.
                // Latches the early cap so the tested ladder ends the run and
                // the farm restarts; endRun() below books but STOPS the bot.
                killNow,
                // v6.104.0: show/hide the overlay without touching the mouse
                panel: on => { setPanelHidden(on === false); return on === false ? 'hidden' : 'shown'; },
                config: CONFIG, learn: () => learn, plan: () => lastPlan, state: () => G.state,
                version: SCRIPT_VERSION, tag: scriptTag(),
                // VERSION SNAPSHOTS
                compare: versionComparison,            // every version side by side, with deltas
                // v6.95.2 (user: "I can't die on this run without purposefully
                // overriding the bot... what should I do to save the data
                // while killing the bot on my own?"): book the run NOW with a
                // live snapshot, then stop driving — the user is free to die,
                // quit, or close the tab without losing the row.
                endRun: () => {
                    deathSnapshot = deathSnapshot || snapshotStats();
                    finishRun(); releaseAll(); stopBot('user-end');
                    return 'run booked + bot stopped — die or quit freely';
                },
                versions: versionReport,               // same table, best-time first (back-compat)
                restartSearch: () => restartSearch('manual'),   // v6.86.0: reopen the search by hand
                recenterSearch: () => recenterSearch('manual'),   // v6.98.0: mean back to defaults + sigma reopened + hof cleared — the ratchet repair
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
                    // v6.111.0: the one-shot migration table, so store-guard can
                    // assert it is emptied once its migration has run.
                    tunablePrior: () => JSON.parse(JSON.stringify(TUNABLE_PRIOR)),
                    evolutionPending, takeCraftPrompt, stateHandlers: STATE_HANDLERS, handleScreens,
                    // v6.88.0 AUDIT: hooks for the regression suite
                    versionRows, applyParams, saveLearn, pruneVersions,
                    // v6.96.2: store-guard + phase-audit hooks
                    getLearn: () => learn, loadLearn, buildPhaseRow, appendAuditRow, refitCem, recenterSearch, demoSave: () => demoSave(),
                    // v6.111.0: the ult-economy accumulators (invulnAllTicks,
                    // ultCasts, ultCdMulSeen, laneInTicks) are per-run and are
                    // cleared in startRun. Testing them without this hook means
                    // asserting against whatever the previous scenario left
                    // behind, which is how a per-run counter quietly becomes a
                    // per-session one.
                    startRun,
                    // v6.112.0: startRun sets hellDetected = pendingHellEntry,
                    // i.e. FALSE. In a live run the play-state handler latches
                    // it from the page's `hell` flag; a scenario calling
                    // planMove directly never reaches that handler, so a
                    // post-startRun hell scene silently runs as a DAY scene.
                    latchHell: () => latchHellDuringPlay(),
                    // v6.120.0: read the latch back. The day-spine retraction
                    // tests are only meaningful if the "day" scene really is a
                    // day scene, and the ONLY way to know is to ask the latch —
                    // `global.hell` is the page flag, not the bot's state, and
                    // the two disagree for exactly one startRun.
                    hellLatched: () => hellDetected,
                    // v6.112.0: the mitigation arithmetic and the run boundary
                    // the boss census books on.
                    breakEven: () => contactBreakEven(),
                    regenRate: () => regenRate(),   // v6.118.0: the regen spine reads this
                    reportSummary, showReport,   // v6.113.0: the overlay report is the product now
                    endRun: () => finishRun(),
                    startDemo: () => { demoToggle(); }, phaseRows: () => (phaseAudit.rows || []).slice(),
                    // v6.109.0: drive the RECORDER, not just the digest. The
                    // demo-digest scenario feeds pre-built samples through
                    // localStorage, so it exercises demoDigest and never
                    // demoTick — the capture path shipped untested until a
                    // teeth check on `def` came back green with the field
                    // deleted.
                    demoTick: () => demoTick(),
                    demoSamples: () => (demoRec && demoRec.samples) ? demoRec.samples.slice() : null,
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
                    setEnemyN: obj => { learn.enemyTypeN = obj; },
                    // v6.107.0 drop-anchor / ring hooks
                    setKillRate: v => { killRate = v; },
                    tunable: () => TUNABLE,
                    setCemMean: (k, v) => { learn.cem.mean[k] = v; },
                    bossRing: () => bossRingRef.v,
                    // v6.107.0 tag-bandit hooks
                    tagsOf, enemyContextBonus,
                    setTagUcb: obj => { learn.tagucb = obj; },
                    getTagUcb: () => learn.tagucb || {},
                    tagLearnBonusOf: n => tagLearnBonus(n, pickContext()),
                    // credit a synthetic pick list, exactly as a finished run would
                    creditTagPicks: (picks, reward) => {
                        const save = runPickCtx;
                        runPickCtx = picks.map(q => ({ name: q.name, x: pickContext() }));
                        creditTagUcb(reward);
                        runPickCtx = save;
                    },
                    hitTypes: () => Object.assign({}, hitTypeRun),
                    hitTypeCounts: () => Object.assign({}, hitTypeN),
                    resetHitTypes: () => { hitTypeRun = {}; hitTypeN = {}; },
                    bossHitSamples: () => bossHitD.slice(),
                    applyDefaults: () => applyParams(DEFAULT_PARAMS),
                    sigmasAtFloor, paramDist, hofRecord,
                    charProfile: charOf,
                    setChar: b => { if (CHARS[b]) activeChar = b; },
                    // v6.99.3: the early-cap stability proof reads the run's
                    // supers count; the test arranges it directly.
                    setSupers: n => { supersThisRun = n; },
                    resetCapLatch: () => { capStableSince = null; capEarly = false; capDipSince = null; capBestStreakS = 0; capLastResetReason = null; },
                    // v6.101.0: the ladder's own clock, so a scenario can put
                    // the run at a chosen rung without replaying 4 minutes.
                    resetCapLadder: () => { capFirstGt = null; capHurtAt = 0; capForcedThisRun = false; capReadyGt = null;
                        capEarly = false; capStableSince = null; capLastResetReason = null;
                        capFirstWall = 0; satSince = null; satPeakEn = 0; },
                    // v6.108.0 hooks. The two escapes are WALL-clock by
                    // design, so a test cannot advance them with gameTime —
                    // it has to age the stamps directly.
                    ageCapWall: ms => { if (capFirstWall) capFirstWall -= (ms || 0); },
                    ageSat: ms => { if (satSince) satSince -= (ms || 0); },
                    armCap: () => { capEarly = true; },
                    killRate: () => killRate,
                    reward: (stats, o) => { const sh = hellRunEnded, sc = capEarly;
                        hellRunEnded = !!(o && o.hell); capEarly = !!(o && o.cap);
                        const r = computeReward(stats); hellRunEnded = sh; capEarly = sc; return r; },
                    rewardEpoch: () => REWARD_EPOCH,
                    phaseRow: (t, hell) => buildPhaseRow(t, hell),
                    capState: () => ({ capEarly, lastResetReason: capLastResetReason,
                                       satSince, satPeakEn, capFirstWall }),
                    setSupers: n => { supersThisRun = n; },
                    speedSamples: () => spdSamples.slice(),
                    capDebug: () => ({ capStableSince, capEarly, capDipSince, capBestStreakS, capLastResetReason, capFirstGt, capForcedThisRun, capReadyGt }),
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
            // v6.112.0 pineBot.bossCensus() — the spawn timetable and the size
            // curve, measured. USER: "given the predictability of the bosses
            // appearance and the size at which they appear, the bot can be
            // calibrated better."
            //
            // Grouped by boss KIND (bossChar/type), because that is what a
            // timetable is indexed by. For each kind: how many runs saw it, the
            // median gt it first appeared, the median radius at first sighting,
            // and the median radius growth per 100 game-seconds fitted from the
            // per-boss samples. `ringAt` is the extrapolated gt at which that
            // kind crosses deepHell.ringShare of the canvas — i.e. when the
            // deep-hell regime becomes available, predicted rather than waited
            // for. A tight `ringAt` across runs IS the calibration the user is
            // describing, and a wide one says the timetable is not the whole
            // story and something else gates the size.
            window.pineBot.bossCensus = () => {
                const runs = (bossCensus && bossCensus.runs) || [];
                const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y);
                    return s.length % 2 ? s[(s.length - 1) / 2] : +(((s[s.length / 2 - 1] + s[s.length / 2]) / 2).toFixed(2)); };
                const W = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
                const target = W * (CONFIG.deepHell.ringShare != null ? CONFIG.deepHell.ringShare : 0.55) / 2;
                const kinds = {};
                for (const run of runs) {
                    for (const b of (run.b || [])) {
                        const k = kinds[b.k] || (kinds[b.k] = { kind: b.k, n: 0, wall: !!b.wall,
                            gts: [], r0s: [], hp0s: [], slopes: [], ringAts: [], spans: [] });
                        k.n++; k.gts.push(b.gt); k.r0s.push(b.r0);
                        if (b.hp0) k.hp0s.push(b.hp0);
                        // v6.116.0: how much game time the KEPT samples actually
                        // cover. Two versions of this census reported nothing
                        // because the sampling window was wrong in opposite
                        // directions, and neither report said so — the span is
                        // the number that would have caught both immediately.
                        if ((b.rs || []).length >= 2) k.spans.push(b.rs[b.rs.length - 1][0] - b.rs[0][0]);
                        // least-squares slope of r against gt over this boss's samples
                        const s = b.rs || [];
                        if (s.length >= 3) {
                            let sx = 0, sy = 0, sxx = 0, sxy = 0;
                            for (const [x, y] of s) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
                            const d = s.length * sxx - sx * sx;
                            if (Math.abs(d) > 1e-6) {
                                const m = (s.length * sxy - sx * sy) / d;          // px per game-second
                                k.slopes.push(+(m * 100).toFixed(2));               // per 100 s
                                if (m > 1e-6) k.ringAts.push(Math.round(b.gt + (target - b.r0) / m));
                            }
                        }
                    }
                }
                return {
                    note: 'runs = census rows kept. Per KIND: firstGt = median gt first sighted, r0 = median radius then, growth = median px per 100 game-seconds (least squares over that boss\'s own samples), ringAt = extrapolated gt it crosses ringShare of the canvas (radius ' + Math.round(target) + 'px) — i.e. when the deep-hell regime opens. A TIGHT ringAt spread across runs is the calibration; a wide one means size is not on a clean timetable. Read `n` first: n<20 is noise. Walls (NO BOOKING) are flagged and excluded from ringHuge.',
                    runs: runs.length,
                    ringTargetR: Math.round(target),
                    kinds: Object.values(kinds).sort((a, b2) => (med(a.gts) || 0) - (med(b2.gts) || 0)).map(k => ({
                        kind: k.kind, n: k.n, wall: k.wall,
                        firstGt: med(k.gts), r0: med(k.r0s), hp0: med(k.hp0s),
                        // spanS = median game-seconds the kept samples cover.
                        // A null growth with a SHORT span means the cadence is
                        // too slow for how long these bosses live; a flat
                        // growth with a short span means the fit was taken
                        // before the growth. Both have shipped.
                        spanS: med(k.spans),
                        growthPer100s: med(k.slopes),
                        ringAt: med(k.ringAts),
                        ringAtSpread: k.ringAts.length >= 3
                            ? [Math.min.apply(null, k.ringAts), Math.max.apply(null, k.ringAts)] : null
                    }))
                };
            };
            // v6.118.0 — the craft-prompt census. `ready` = ticks a craft was
            // OWED (both halves maxed); `seen` = ticks a craft-ish button was
            // on screen; `clicked` / `confirmed` = what we did and whether the
            // prompt then went away. ready >> seen means the prompt never
            // appears (the game's trigger, not ours); seen >> clicked means the
            // selectors miss it and `labels` says what it actually reads;
            // clicked >> confirmed means the click does not land.
            window.pineBot.craftAudit = () => {
                const a = craftAudit || {};
                return {
                    note: 'ready = planner ticks with both halves of a CRAFT_PAIR at max, i.e. a craft is owed. seen = ticks a craft-ish button was visible. clicked = prompts we clicked. confirmed = prompts that then disappeared (proof the click worked). READ ready vs seen FIRST: a large ready with seen 0 means the prompt never appears and the bug is upstream of this script; seen without clicked means the selectors missed it, and `labels` holds the real button text.',
                    runs: a.runs || 0, ready: a.ready || 0, seen: a.seen || 0,
                    clicked: a.clicked || 0, confirmed: a.confirmed || 0,
                    labels: a.labels || {}, pairs: a.pairs || {}
                };
            };
            window.pineBot.resetCraftAudit = () => {
                craftAudit = { runs: 0, ready: 0, seen: 0, clicked: 0, confirmed: 0, labels: {}, pairs: {} };
                craftAuditSave(); return 'craft audit cleared';
            };
            window.pineBot.resetBossCensus = () => {
                bossCensus = { runs: [] };
                try { localStorage.removeItem(BOSS_CENSUS_KEY); } catch (e) { }
                return 'boss census cleared';
            };
            window.pineBot.resetParkAudit = () => {
                parkAudit = { runs: [] };
                try { localStorage.removeItem(PARK_AUDIT_KEY); } catch (e) { }
                return 'park audit cleared';
            };
            // v6.96.2: pineBot.phaseAudit() — the funnel, per version+char.
            // Every run books exactly one phase (day / entry / hell / deep),
            // so the four death counts ARE the survival story: dayClearRate
            // is the day lever, entrySurvival is the seat's lever, and
            // deepRate (cap-outs included, reported separately) is the
            // doctrine's bottom line. parkAudit stays the seat's detail view;
            // this is the view that sees the 82% who never got there.
            window.pineBot.phaseAudit = () => {
                const rows = (phaseAudit && phaseAudit.rows) || [];
                const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y);
                    return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
                const by = {};
                for (const r of rows) {
                    const g = by[r.v] || (by[r.v] = { version: r.v, n: 0, deaths: { day: 0, entry: 0, hell: 0, deep: 0 },
                        dayCleared: 0, hellEntered: 0, seated: 0, caps: 0, defs: [], regens: [], ults: [], times: [] });
                    g.n++; g.deaths[r.ph] = (g.deaths[r.ph] || 0) + 1;
                    if (r.day) g.dayCleared++;
                    if (r.ph !== 'day') { g.hellEntered++; if (r.seat) g.seated++; }
                    if (r.cap) g.caps++;
                    // v6.99.4: split early (stability proof) from clock caps,
                    // and keep the latch times so fromS can be tuned from data.
                    if (r.capAt != null) {
                        g.capAts = g.capAts || [];
                        g.capAts.push(r.capAt);
                        if (r.capAt < ((CONFIG.deepHell && CONFIG.deepHell.runCapS) || 9000)) g.earlyCaps = (g.earlyCaps || 0) + 1;
                    }
                    // v6.102.0: when the BUILD was complete, cap-out or not —
                    // the datum capStable.fromS should be set from.
                    if (r.readyAt != null) { g.readyAts = g.readyAts || []; g.readyAts.push(r.readyAt); }
                    // v6.112.0 THE REGIME. `deepRate` below counts runs that
                    // ENDED past deepFromS — a clock that is blind to whether
                    // the anchor ever worked, and that the early cap makes
                    // structurally unreachable for exactly the runs we want
                    // (a proven build is killed at capStable.fromS 2400, and
                    // deepFromS is 7200). These count the state instead.
                    if (r.deepAt != null) { g.deepAts = g.deepAts || []; g.deepAts.push(r.deepAt); }
                    if (r.deepHold != null) {
                        g.deepHolds = g.deepHolds || [];
                        g.deepHolds.push(r.deepHold);
                        if (r.deepHold >= ((CONFIG.phaseAudit && CONFIG.phaseAudit.deepHoldS) || 120))
                            g.deepHeld = (g.deepHeld || 0) + 1;
                    }
                    if (r.deepStill != null) { g.deepStills = g.deepStills || []; g.deepStills.push(r.deepStill); }
                    if (r.deepInv != null) { g.deepInvs = g.deepInvs || []; g.deepInvs.push(r.deepInv); }
                    if (Array.isArray(r.deepHolds)) { g.allHolds = (g.allHolds || []).concat(r.deepHolds); }
                    if (r.deepBreak) { g.breaks = g.breaks || {};
                        for (const k of Object.keys(r.deepBreak)) g.breaks[k] = (g.breaks[k] || 0) + r.deepBreak[k]; }
                    // v6.116.0: the seat-miss census, summed across runs, plus
                    // the two totals it is a share of.
                    if (r.parkMiss) { g.miss = g.miss || {};
                        for (const k of Object.keys(r.parkMiss)) g.miss[k] = (g.miss[k] || 0) + r.parkMiss[k]; }
                    if (r.hellT != null) g.hellT = (g.hellT || 0) + r.hellT;
                    if (r.parkT != null) g.parkT = (g.parkT || 0) + r.parkT;
                    // v6.113.0: the v6.111.0 instruments were written to every
                    // phase ROW and never aggregated, so the funnel — the thing
                    // actually read — could not show whether the lane override
                    // or the ult economy had moved at all.
                    if (r.laneIn != null) g.laneIn = (g.laneIn || 0) + r.laneIn;
                    if (r.laneEsc != null) g.laneEsc = (g.laneEsc || 0) + r.laneEsc;
                    if (r.laneDiv != null) g.laneDiv = (g.laneDiv || 0) + r.laneDiv;
                    if (r.invAll != null) { g.invAlls = g.invAlls || []; g.invAlls.push(r.invAll); }
                    if (r.inv != null) { g.invs = g.invs || []; g.invs.push(r.inv); }
                    if (r.casts != null) { g.castsArr = g.castsArr || []; g.castsArr.push(r.casts); }
                    if (r.cdMul != null) { g.cdMuls = g.cdMuls || []; g.cdMuls.push(r.cdMul); }
                    if (r.ultMax != null) { g.ultMaxes = g.ultMaxes || []; g.ultMaxes.push(r.ultMax); }
                    // v6.108.0 the stall signature, aggregated per version.
                    if (r.spd != null) { g.spds = g.spds || []; g.spds.push(r.spd); }
                    if (r.spdLo != null) { g.spdLos = g.spdLos || []; g.spdLos.push(r.spdLo); }
                    if (r.enMax != null) { g.enMaxes = g.enMaxes || []; g.enMaxes.push(r.enMax); }
                    if (r.why === 'saturated') g.satCaps = (g.satCaps || 0) + 1;
                    if (r.def != null) g.defs.push(r.def);
                    if (r.regen != null) g.regens.push(r.regen);
                    if (r.ultLv != null) g.ults.push(r.ultLv);
                    g.times.push(r.t);
                }
                return {
                    rows: rows.length,
                    note: 'phase = where the run ENDED. entrySurvival = of hell entrants, the share that outlived the first ' +
                          ((CONFIG.phaseAudit && CONFIG.phaseAudit.entryS) || 300) + ' s. deep includes cap-outs (capOuts counts them; those rows are right-censored, not natural deaths). ' +
                          'READ deepHeldRate, NOT deepRate. deepRate counts runs that ENDED past deepFromS (' +
                          ((CONFIG.phaseAudit && CONFIG.phaseAudit.deepFromS) || 7200) + ' s) — a clock blind to whether the anchor ever worked, and one the early cap makes unreachable for the runs that matter: a proven build is killed at capStable.fromS (' +
                          ((CONFIG.deepHell && CONFIG.deepHell.capStable && CONFIG.deepHell.capStable.fromS) || 2400) + ' s), so a WORKING build can never be booked deep while a failing one can. ' +
                          'deepHeldRate = share of runs that held the REGIME (boss ring >= 55% of canvas, tips stopped past ' +
                          ((CONFIG.deepHell && CONFIG.deepHell.tipWindowToS) || 4800) + ' s, corner-anchored with zero velocity) for ' +
                          ((CONFIG.phaseAudit && CONFIG.phaseAudit.deepHoldS) || 120) + ' s. deepStill/deepInv are percentages DURING the hold: how much of it needed no movement, and how much was covered by an ult window.',
                    groups: Object.values(by).map(g => ({
                        version: g.version, n: g.n, deaths: g.deaths,
                        dayClearRate: +(g.dayCleared / g.n).toFixed(2),
                        entrySurvival: g.hellEntered ? +((g.hellEntered - (g.deaths.entry || 0)) / g.hellEntered).toFixed(2) : null,
                        deepRate: +((g.deaths.deep || 0) / g.n).toFixed(2),
                        capOuts: g.caps,
                        earlyCaps: g.earlyCaps || 0,
                        medianCapAt: med(g.capAts || []),
                        buildsReady: (g.readyAts || []).length,
                        medianReadyAt: med(g.readyAts || []),
                        // v6.112.0 — the two numbers that answer "is the bot
                        // stable enough". deepReached counts runs that ENTERED
                        // the regime at all; deepHeldRate counts those that
                        // held it for deepHoldS. Read deepHeldRate as the
                        // scoreboard and deepStill/deepInv as the proof that
                        // what was held is the posture the user described
                        // rather than something that merely coincided with it.
                        deepReached: (g.deepAts || []).length,
                        medianDeepAt: med(g.deepAts || []),
                        deepHeldRate: +((g.deepHeld || 0) / g.n).toFixed(3),
                        medianDeepHold: med(g.deepHolds || []),
                        medianDeepStill: med((g.deepStills || []).map(v => Math.round(v * 100))),
                        medianDeepInv: med((g.deepInvs || []).map(v => Math.round(v * 100))),
                        // v6.115.0 — set deepHoldS from medianHold, and read
                        // deepBreak to see WHICH clause keeps dropping.
                        holds: (g.allHolds || []).length,
                        medianHold: med(g.allHolds || []),
                        maxHold: (g.allHolds || []).length ? Math.max.apply(null, g.allHolds) : null,
                        deepBreak: g.breaks || null,
                        // v6.116.0 THE SEAT CENSUS. seatShare is the fraction
                        // of all hell ticks the bot was actually anchored;
                        // parkMiss is every other tick sorted by what took it,
                        // in planner precedence (build gates armor/regen/clear,
                        // then early, then the exceptions mark/line/yield, then
                        // the overrides cap/lane/hunt, then walk = parkOn was
                        // true and the bot was still crossing to the corner).
                        // The largest bucket is the next version's target.
                        seatShare: g.hellT ? +((g.parkT || 0) / g.hellT).toFixed(3) : null,
                        parkMiss: g.miss || null,
                        // v6.113.0 lane override + ult economy, aggregated
                        laneIn: g.laneIn || 0, laneEsc: g.laneEsc || 0, laneDiv: g.laneDiv || 0,
                        medianInv: med((g.invs || []).map(v => Math.round(v * 100))),
                        medianInvAll: med((g.invAlls || []).map(v => Math.round(v * 100))),
                        medianCasts: med(g.castsArr || []),
                        medianCdMul: med(g.cdMuls || []),
                        ultMaxedRate: (g.ultMaxes || []).length
                            ? +(g.ultMaxes.filter(v => v >= 6).length / g.ultMaxes.length).toFixed(2) : null,
                        seatedRate: g.hellEntered ? +(g.seated / g.hellEntered).toFixed(2) : null,
                        medianEntryDef: med(g.defs), medianEntryRegen: med(g.regens), medianEntryUlt: med(g.ults),
                        medianTimeS: med(g.times),
                        // v6.108.0: 1.0 is a healthy page. The stall that
                        // motivated this version ran at 0.021 with enemies
                        // pinned at the ~260 entity cap. satCaps counts the
                        // runs the new saturation arm ended.
                        medianSpeed: med(g.spds || []),
                        worstSpeed: (g.spdLos || []).length ? Math.min.apply(null, g.spdLos) : null,
                        medianPeakEnemies: med(g.enMaxes || []),
                        satCaps: g.satCaps || 0
                    }))
                };
            };
            window.pineBot.resetPhaseAudit = () => {
                phaseAudit = { rows: [] };
                try { localStorage.removeItem(PHASE_AUDIT_KEY); } catch (e) { }
                return 'phase audit cleared';
            };
            // v6.100.1 (user: "the bot is not dying even with the kill
            // protocol"): a LIVE inspector for the early-cap stability proof,
            // so a run that "should" be immortal but keeps dashing can be
            // checked mid-run instead of guessed at. Call this while a hell
            // run is past capStable.fromS and read WHY capEarly hasn't
            // latched: streakS vs holdS needed, which leg (hp/def/supers) is
            // short, and bestStreakS (the closest this run has gotten).
            window.pineBot.capStatus = () => {
                const CS = (CONFIG.deepHell && CONFIG.deepHell.capStable) || {};
                const gt = safe(() => gameTime, 0) || 0;
                const p = safe(() => player, null);
                const hp = p && typeof p.hp === 'number' && typeof p.maxHp === 'number' && p.maxHp > 0
                    ? p.hp / p.maxHp : null;
                const hpFloor = CS.hpFloor != null ? CS.hpFloor : 0.97;
                const defMin = CS.defMin != null ? CS.defMin : 35;
                const supersMin = CS.supersMin != null ? CS.supersMin : 3;
                const def = liveDefense();
                return {
                    gt: Math.round(gt),
                    fromS: CS.fromS != null ? CS.fromS : 3600,
                    holdS: CS.holdS != null ? CS.holdS : 300,
                    dipGraceS: CS.dipGraceS != null ? CS.dipGraceS : 0,
                    capEarly, capFiredThisRun,
                    runCapS: (CONFIG.deepHell && CONFIG.deepHell.runCapS) || 0,
                    // v6.101.0 the ladder: which rung, and how long it has been climbing
                    capAt: capFirstGt == null ? null : Math.round(capFirstGt),
                    cappedForS: capFirstGt == null ? 0 : Math.round(gt - capFirstGt),
                    stage: capFirstGt == null ? 0
                        : (gt - capFirstGt) >= (CONFIG.deepHell.capForceS != null ? CONFIG.deepHell.capForceS : 240) ? 3
                        : (gt - capFirstGt) >= (CONFIG.deepHell.capStandS != null ? CONFIG.deepHell.capStandS : 150) ? 2 : 1,
                    forced: capForcedThisRun,
                    streakS: capStableSince == null ? 0 : Math.round(gt - capStableSince),
                    bestStreakS: Math.round(capBestStreakS),
                    inDip: capDipSince != null,
                    dipForS: capDipSince == null ? 0 : Math.round(gt - capDipSince),
                    lastResetReason: capLastResetReason,
                    // v6.102.0: when this run's build met armour+supers, and a
                    // standing check that defMin is actually reachable at all
                    // (it shipped at 35 against a 34.992 ceiling until 6.102.0).
                    readyAt: capReadyGt == null ? null : Math.round(capReadyGt),
                    defMinReachable: defMin <= 34.992,
                    live: { hp: hp == null ? null : +hp.toFixed(3), def: def == null ? null : +def.toFixed(1), supers: supersThisRun },
                    need: { hpFloor, defMin, supersMin },
                    short: {
                        hp: hp != null && hp < hpFloor,
                        def: def != null && def < defMin,
                        supers: (typeof supersThisRun === 'number' ? supersThisRun : 0) < supersMin
                    }
                };
            };
            // v6.97.1 (user: "let's build this combined probe now"):
            // pineBot.report() — the whole statistics picture in ONE paste.
            // The four probes every tuning conversation has been asking for
            // separately: the version table, the phase funnel, the raw
            // per-run phase rows, and the damage attribution. Console use:
            //   copy(JSON.stringify(pineBot.report()))
            // v6.107.0 — THE LEARNING PROBE. Four new machines shipped in this
            // version (the tag bandit, the re-applied enemy-type multiplier,
            // the drop anchor, and two searchable ring multipliers) and none
            // of them is legible from the four probes above. `learning` is
            // where they report.
            //
            // Built to be FALSIFIABLE, on the user's standing note that this
            // game is AI-built, "has several bugs and misclassifications", and
            // "the truth is what's being observed in the game itself". Every
            // block below is evidence ABOUT a hypothesis the code encodes:
            //   tags   — WEAPON_TAGS is a guess derived from the recipe book.
            //            A tag whose weight never separates from zero is a tag
            //            that does not describe anything real. `n` is the
            //            credited weight, so read weight WITH n, never alone.
            //   enemy  — what has actually been hurting this bartender, by the
            //            game's OWN type labels. If those labels are wrong the
            //            table still holds, because it measures whatever the
            //            game calls that thing, not what it ought to be.
            //   params — where the CEM has walked the four new dimensions.
            //            A mean pinned at a box edge means the box is wrong.
            //   anchor — did the drop anchor arm at all this run. Firing rate
            //            comes before any question about whether it pays.
            window.pineBot.learning = () => {
                const round = (v, d) => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(d == null ? 2 : d) : null;
                const tags = {};
                try {
                    const tu = learn.tagucb || {};
                    for (const k of Object.keys(tu)) {
                        const m = tu[k];
                        if (!m || !Array.isArray(m.b)) continue;
                        // feature 0 is the bias: the tag's context-free value.
                        const A0 = (isFinite(m.A[0]) ? m.A[0] : 0) + 1;
                        tags[k] = { n: round(m.n, 1), weight: round((isFinite(m.b[0]) ? m.b[0] : 0) / A0, 3),
                                    boss: round(((isFinite(m.b[7]) ? m.b[7] : 0) / ((isFinite(m.A[7]) ? m.A[7] : 0) + 1)), 3),
                                    hell: round(((isFinite(m.b[4]) ? m.b[4] : 0) / ((isFinite(m.A[4]) ? m.A[4] : 0) + 1)), 3) };
                    }
                } catch (e) { }
                const enemy = {};
                try {
                    const mm = learn.enemyTypeMul || {}, nn = learn.enemyTypeN || {};
                    const minN = CONFIG.learning.enemyMulMinN;
                    for (const k of new Set([].concat(Object.keys(mm), Object.keys(nn)))) {
                        enemy[k] = { mul: round(mm[k], 3), soleHits: nn[k] || 0,
                                     applied: (nn[k] || 0) >= minN ? round(typeMul(k), 3) : 1 };
                    }
                } catch (e) { }
                // v6.109.0: ALL of them, not the four newest. This block used
                // to hardcode the 6.107.0 dimensions, which meant 23 of 27
                // were invisible — including threat.markWeight and
                // threat.lineWeight, the two that govern the 54% of day
                // deaths caused by marks and lines. `atEdge` flags a mean
                // sitting within 2% of a bound: that is the search telling
                // you the BOX is wrong, and it cannot be read any other way.
                const params = {};
                try {
                    for (const k of Object.keys(TUNABLE)) {
                        const box = TUNABLE[k], rng = box.max - box.min;
                        const mean = learn.cem.mean[k], sig = learn.cem.sigma[k];
                        const row = { live: round(getParam(k), 3), mean: round(mean, 3),
                                      sigma: round(sig, 3), box: [box.min, box.max] };
                        if (isFinite(mean) && rng > 0) {
                            if (mean <= box.min + rng * 0.02) row.atEdge = 'min';
                            else if (mean >= box.max - rng * 0.02) row.atEdge = 'max';
                        }
                        // sigma at the floor = converged, no exploration left
                        if (isFinite(sig) && rng > 0 && sig <= rng * CONFIG.learning.sigmaFloor * 1.02) row.converged = true;
                        params[k] = row;
                    }
                } catch (e) { }
                return {
                    note: 'tags: read `weight` WITH `n` — a big weight at n<20 is noise. `boss`/`hell` are the same estimate on the boss-share and hell features. enemy: `mul` is stored, `applied` is what the danger field actually used (band ' + CONFIG.learning.enemyMulFloor + '-' + CONFIG.learning.enemyMulCeil + ', needs ' + CONFIG.learning.enemyMulMinN + ' sole hits). params: ALL CEM dims. `atEdge` = the mean is against a bound, so the BOX is wrong, not the value. `converged` = sigma at the floor, no exploration left — and note that until v6.111.0 widening a box did NOT clear that state, so a dim could sit atEdge+converged across version bumps forever. `reopen` names the dims this build re-opened. ult: compare `invAll` (NOT `inv`) against a demo\'s invulnShare — `inv` is ult windows only, the demo ORs in player.invuln hit frames, and reading one against the other produced a 3.9x gap that does not exist.',
                    gen: safe(() => learn.cem.gen, null),
                    runs: safe(() => learn.runs, null),
                    // v6.111.0: which dimensions the box-change migration
                    // re-opened, and when. Silent until a box actually moves.
                    reopen: safe(() => learn.cem.lastReopen, null),
                    reopens: safe(() => learn.cem.reopens, 0),
                    tags, enemy, params,
                    anchor: { armedTicksThisRun: dropAnchorTicks, lastArmedGt: Math.round(dropAnchorLastGt) }
                };
            };
            // ── v6.113.0 ONE BUTTON, EVERY AUDIT ───────────────────────────
            //
            // USER: "I want this all done by the report on the UI overlay ...
            // when asking for audit, pine bot report, damage report, deep held
            // rate, etc."
            //
            // report() carried six of the fourteen instruments. Every session
            // has therefore ended with me asking for one of the other eight by
            // name and the user opening a console to fetch it — park, income,
            // hunt, mark, pause, picks, capStatus, bossHitRange. There is no
            // reason for that: they are all cheap pure reads of state that is
            // already in memory. Anything I can ask for is now in the object
            // the 📋 button copies.
            //
            // `safe(...)` around each: one audit throwing (an empty store, a
            // stat the page has stopped exposing) must degrade that key to
            // null, never take the whole report down with it — the failure
            // mode that would send the user straight back to the console.
            window.pineBot.report = () => ({
                note: 'paste this whole object to Claude — it contains every audit. compare = version table; funnel = phase aggregation (READ deepHeldRate, not deepRate); phases = raw per-run rows; damage = HP-loss attribution; boss = spawn timetable + size growth + predicted ringAt; learning = CEM dims/tags/enemy types (atEdge = the BOX is wrong, converged = no exploration left); park/income/hunt/mark/pause/picks = the per-subsystem audits; cap = live kill-protocol state.',
                summary: reportSummary({
                    compare: safe(() => versionComparison(), null),
                    funnel: safe(() => window.pineBot.phaseAudit(), null),
                    damage: safe(() => window.pineBot.damageAudit(), null),
                    boss: safe(() => window.pineBot.bossCensus(), null),
                    learning: safe(() => window.pineBot.learning(), null)
                }),
                compare: safe(() => versionComparison(), null),
                funnel: safe(() => window.pineBot.phaseAudit(), null),
                phases: safe(() => (phaseAudit.rows || []).slice(), null),
                damage: safe(() => window.pineBot.damageAudit(), null),
                boss: safe(() => window.pineBot.bossCensus(), null),
                learning: safe(() => window.pineBot.learning(), null),
                // v6.113.0 — the eight that used to require a console
                park: safe(() => window.pineBot.parkAudit(), null),
                income: safe(() => window.pineBot.incomeAudit(), null),
                hunt: safe(() => window.pineBot.huntAudit(), null),
                mark: safe(() => window.pineBot.markAudit(), null),
                pause: safe(() => window.pineBot.pauseAudit(), null),
                craft: safe(() => window.pineBot.craftAudit(), null),   // v6.118.0
                // the module array, not window.pineBot.pickAudit — that lives
                // under pineBot.test and the optional-call guard would have
                // silently produced `undefined`, which JSON.stringify DROPS.
                // A key that vanishes reads as "no data" rather than "wrong
                // accessor", which is exactly how a missing audit hides.
                picks: safe(() => pickAudit.slice(-40), null),
                cap: safe(() => window.pineBot.capStatus(), null),
                bossHit: safe(() => window.pineBot.bossHitRange(), null)
            });
            // The same headline block the overlay prints, as a string — so a
            // quick "how is it going" needs neither a paste nor a screenshot.
            window.pineBot.summary = () => reportSummary(window.pineBot.report());
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


    // =================================================================
    // MOVEMENT — direction sampling on the real field
    // =================================================================
    function enemyProfile(e) {
        const t = String((e && (e.type || e.kind)) || '').toLowerCase();
        return ENEMY_PROFILE[t] || ENEMY_PROFILE._default;
    }

    function gatherThreats(p) {
        const out = {
            enemies: [], projectiles: [], marks: [], lines: [], near: 0, boss: false,
            passouts: [],
            mix: { swarm: 0, ranged: 0, bomber: 0, boss: 0, total: 0 }
        };
        const R = CONFIG.threat.enemyRange;

        const es = G.enemies;
        if (Array.isArray(es)) {
            for (const e of es) {
                if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') continue;
                if (e.dead === true || (typeof e.hp === 'number' && e.hp <= 0)) continue;
                const t0 = String(e.type || e.kind || '').toLowerCase();
                const bc0 = String(e.bossChar || '');
                // Passed-out customers: NOT a threat — a stationary source of
                // gold and XP. Farmed like loot, excluded from panic/kiting/
                // toughness so they never distort the threat picture.
                if (t0 === 'passout') {
                    // LIVE-AUDIT FIX: a passout mid-FALL lands with radius
                    // r*1.9 and dmg*1.5 (source-verified) — the falling body
                    // is a telegraphed AoE strike, not a farm target yet.
                    if (typeof e.fallT === 'number' && e.fallT > 0) {
                        // v6.85.2: tagged `drop` so the ANCHOR test can ignore
                        // it. It stays a real hazard in the danger field (never
                        // stand under a falling body), but in the day these fire
                        // constantly — every manual-demo `marks:3` window is a
                        // passout landing 1-2s later — and `markHere` was
                        // cancelling the anchor almost permanently because of it.
                        out.marks.push({ x: e.x, y: e.y, r: (typeof e.r === 'number' ? e.r : 14) * 1.9 + CONFIG.threat.markPad, drop: true });
                        continue;
                    }
                    if (Math.hypot(e.x - p.x, e.y - p.y) < CONFIG.movement.lootRange * 1.3) {
                        out.passouts.push({
                            x: e.x, y: e.y, r: (typeof e.r === 'number' ? e.r : 12),
                            hp: typeof e.hp === 'number' ? e.hp : 40,
                            maxHp: typeof e.maxHp === 'number' ? e.maxHp : (typeof e.hp === 'number' ? e.hp : 40),
                            id: typeof e.id === 'number' ? e.id : 0   // lower id = fell first
                        });
                    }
                    continue;
                }
                const d = Math.hypot(e.x - p.x, e.y - p.y);
                if (d > R) continue;
                const prof = enemyProfile(e);
                const t = t0;
                // NO BOOKING boss = a WALL: impassable, but it does not chase.
                const isWall = e.wall === true || /nobook/i.test(String(e.bossChar || '') + ' ' + String(e.type || ''));
                // LIVE-VERIFIED: real enemies carry NO vx/vy — they have
                // `speed` + `moving` and chase the player directly. The old
                // code read vx||0 = 0, so the planner predicted ZERO motion
                // for every live enemy (and mislabeled every moving boss as
                // stationary). Synthesize the chase vector from speed.
                let vx = e.vx || e.dx || 0, vy = e.vy || e.dy || 0;
                let spd = typeof e.speed === 'number' ? e.speed : 0;
                const fr = safe(() => frame, null);
                const frozen = typeof e.frozenUntil === 'number' && fr != null && e.frozenUntil > fr;
                const frozenLeft = frozen ? (e.frozenUntil - fr) : 0;
                if (frozen) spd = 0;   // frozen: no chase
                if (!vx && !vy && spd > 0 && e.moving !== false && !isWall && d > 1) {
                    vx = (p.x - e.x) / d * spd;
                    vy = (p.y - e.y) / d * spd;
                }
                const isStationary = t === 'boss' && Math.abs(vx) + Math.abs(vy) < 0.01;
                // FAST CHASER (the four-hour two-top killer): a boss at or
                // above our own speed can NEVER be safely ringed — backing
                // out of its contact radius is impossible once it closes.
                const pSpeed = (typeof p.speed === 'number' && p.speed > 0) ? p.speed : CONFIG.movement.playerSpeed;
                const chaserFast = !isWall && !isStationary && spd >= pSpeed * 0.85;
                // FOUR-HOUR TWO-TOP — SOURCE-VERIFIED: a PAIRED boss. When
                // partners close within GZ_PAIR_DIST they form a freeze field
                // around their MIDPOINT (radius GZ_FREEZE_R): slow 0.6 AND
                // a hard freeze. Handled as a ZONE below, not as chase fear.
                const freezeAura = t === 'boss' && !!e.partner;
                // USER: with OLIVE armor stacked, rushing commons barely
                // scratch — fear of non-boss mobs scales DOWN with armor
                // (up to -36% at OLIVE 6), so the bot stands and grinds.
                const gtDay = safe(() => gameTime, 0) || 0;
                const armorEase = ((t !== 'boss' && !isWall)
                    ? 1 - 0.06 * Math.min(6, ownedLevels['OLIVE'] || 0) : 1) *
                    ((t !== 'boss' && !isWall && gtDay < 1200 && !hellDetected) ? 1.15 : 1);   // DAY: commons are avoided, not absorbed (manual run crowd median 0)
                out.enemies.push({
                    x: e.x, y: e.y, vx, vy, spd,
                    r: (typeof e.r === 'number' ? e.r : 10) + CONFIG.threat.contactPad,
                    reach: (prof.radius + (chaserFast && t === 'boss' ? 50 : 0) + (freezeAura ? 130 : 0)) * (slowPadRef.v || 1),   // fast bosses + freeze auras: fear from further out, scaled by how slowed we are
                    w: prof.weight * armorEase,
                    wall: isWall, boss: t === 'boss', stationary: isStationary, chaserFast, freezeAura,
                    frozen, frozenLeft
                });
                // A wall next to you is not a swarm closing in — it never
                // counts toward "surrounded" panic.
                // record the first appearance of each enemy class this run —
                // the MEASURED spawn timetable (user: use in-game data, not
                // assumptions) that drives the prep windows below
                const tkey = String(e.bossChar || t0).replace(/_(stand|walk[A-Z]?|icon)$/i, '');
                if (seenTypesThisRun[tkey] == null) {
                    const gtSeen = safe(() => gameTime, null);
                    if (typeof gtSeen === 'number') seenTypesThisRun[tkey] = Math.round(gtSeen);
                }
                if (d < CONFIG.movement.nearbyRadius && !isWall) out.near++;
                if (t === 'boss') { out.boss = true; out.mix.boss++; }
                else if (t === 'thrower' || t === 'genz') out.mix.ranged++;   // genz have shootCd — they're shooters (source-verified)
                else if (t === 'bomber') out.mix.bomber++;
                else out.mix.swarm++;
                out.mix.total++;

                // PAIR-FREEZE ZONE: mark the midpoint while the partners are
                // seated (or closing on each other) so the planner routes
                // around it exactly like any telegraphed AoE.
                if (t === 'boss' && e.partner && typeof e.partner.x === 'number') {
                    const pairD = Math.hypot(e.x - e.partner.x, e.y - e.partner.y);
                    if (pairD < GZ_PAIR_DIST * 2.2) {   // seated, or about to sit
                        out.marks.push({
                            x: (e.x + e.partner.x) / 2, y: (e.y + e.partner.y) / 2,
                            r: GZ_FREEZE_R + CONFIG.threat.markPad + (pairD < GZ_PAIR_DIST ? 14 : 0),
                            pairFreeze: true
                        });
                    }
                }

                // SOURCE-VERIFIED TELEGRAPHS, read straight off the entity:
                // a bomber with its fuse lit (fuseUntil) explodes in a blast
                // radius — treat that circle as a telegraphed AoE mark NOW.
                if (t === 'bomber' && e.fuseUntil) {
                    out.marks.push({ x: e.x, y: e.y, r: (e.blast || e.bomb || 60) + CONFIG.threat.markPad });
                }
                // a thrower in its vomit windup (vomitUntil) is about to fire
                // at OUR position — pre-dodge the firing line before the
                // projectile even exists.
                if (t === 'thrower' && e.vomitUntil) {
                    out.lines.push({ x1: e.x, y1: e.y, x2: p.x, y2: p.y, thickness: 30 });
                }
                if (typeof e.hp === 'number' && t !== 'boss') { out.hpSum = (out.hpSum || 0) + e.hp; out.hpN = (out.hpN || 0) + 1; }
            }
        }

        const eps = G.eprojectiles;
        if (Array.isArray(eps)) {
            for (const q of eps) {
                if (!q || typeof q.x !== 'number' || typeof q.y !== 'number') continue;
                if (q.dead === true) continue;
                // FEED FILLER / RANDOM-LANDING ATTACKS (user report + source:
                // falling objects carry land/landR — a landing Y and blast
                // radius): the DROP POINT is the threat, telegraphed like a
                // SOUTH SIDE flame — mark the landing zone and pre-dodge it.
                if (typeof q.land === 'number') {
                    const falling = q.y < q.land - 6;
                    if (falling) {
                        // still in the air: pre-dodge the telegraphed impact
                        out.marks.push({ x: q.x, y: q.land, r: (typeof q.landR === 'number' ? q.landR : 44) + CONFIG.threat.markPad });
                    } else {
                        // LANDED and persisting: a solid contact hazard sitting
                        // on the floor — model it where it actually is.
                        out.marks.push({ x: q.x, y: q.y, r: (typeof q.r === 'number' ? q.r : 16) + CONFIG.threat.markPad, litter: true });
                    }
                    continue;
                }
                if (Math.hypot(q.x - p.x, q.y - p.y) > 340) continue;   // see boss volleys a beat earlier
                out.projectiles.push({
                    x: q.x, y: q.y,
                    vx: q.vx ?? q.dx ?? 0, vy: q.vy ?? q.dy ?? 0,
                    r: (typeof q.r === 'number' ? q.r : 6) + CONFIG.threat.projPad,
                    // source-verified: Smooth Operator's phones carry `home`
                    // (a homing speed) — they curve toward the player, so the
                    // straight-line model would misread them entirely
                    home: (typeof q.home === 'number' && q.home > 0) ? q.home : 0,
                    w: (q.noKill === true ? CONFIG.threat.noKillBonus : 1) * (q.home ? 1.6 : 1)   // homing phones: evadable but relentless — respect them
                });
            }
        }

        const dm = G.dropMarks;
        if (Array.isArray(dm)) {
            const gtM = safe(() => gameTime, null);
            for (const m of dm) {
                if (!m) continue;
                // position may sit on the mark itself, or (older shape) on an
                // `at` OBJECT — accept both, never assume.
                const px = typeof m.x === 'number' ? m.x : (m.at && typeof m.at.x === 'number' ? m.at.x : null);
                const py = typeof m.y === 'number' ? m.y : (m.at && typeof m.at.y === 'number' ? m.at.y : null);
                if (px == null || py == null) continue;
                // passout landing markers ride in this array too: they carry
                // hp/givesTip and no damage. They are loot, not hazards.
                const isHazard = typeof m.dmg === 'number' || typeof m.tele === 'number';
                if (!isHazard) continue;
                // `at` is the gameTime the blast lands -> seconds remaining
                let tLeft = null;
                if (typeof m.at === 'number' && typeof gtM === 'number') tLeft = m.at - gtM;
                out.marks.push({
                    x: px, y: py,
                    r: (typeof m.r === 'number' ? m.r : 40) + CONFIG.threat.markPad,
                    tLeft, dmg: typeof m.dmg === 'number' ? m.dmg : 0,
                    tele: typeof m.tele === 'number' ? m.tele : null
                });
            }
        }

        // Include UNARMED lanes too: armed:false is the TELEGRAPH phase — the
        // exact window to step off the line before the charge fires.
        const rl = G.roadLines;
        if (Array.isArray(rl)) for (const l of rl) if (l) out.lines.push(l);

        // LINEBACKER ID: the boss that owns active charge lanes. It charges
        // along rays — never hold a ring on it; kite and let homing/directed
        // fire do the work (they track it even off-screen).
        try {
            const owners = new Set((G.roadLines || []).map(l => l && l.owner).filter(o => o != null));
            if (owners.size) for (const e of out.enemies) {
                if (e.boss && !e.wall) e.linebacker = true;   // lanes up: treat lane-capable bosses as chargers
            }
        } catch (e) { }

        // Contested-target check: a passout or wall with live enemies around
        // it is a baited trap — farm it later, when the area is clear. (The
        // run data showed contact deaths climbing once farming landed: greed
        // was pulling the bot into crowds.)
        const chasersNear = (x, y, r) => {
            let n = 0;
            for (const e of out.enemies) if (!e.wall && Math.hypot(e.x - x, e.y - y) < r) n++;
            return n;
        };
        for (const po of out.passouts) po.contested = chasersNear(po.x, po.y, 85) >= 3;   // late-day density made 2 flag EVERY passout
        for (const e of out.enemies) if (e.wall) e.contested = chasersNear(e.x, e.y, 100) >= 3;

        // FINALE CHASE RIVAL (source-verified, live-diagnosed): during the
        // day-end chase, `finale.rival` hunts the player and hits for HALF
        // MAX HP per touch. It lives OUTSIDE the enemies array, so the old
        // planner was blind to it — the biggest single hits in the damage
        // audit (44.5 through armor) all came from this entity. Treat it as
        // a maximum-priority chaser: huge repulsion, wide contact buffer,
        // and NEVER an engagement target.
        const fin = G.finale;
        if (fin && fin.active === true && fin.rival &&
            typeof fin.rival.x === 'number' && typeof fin.rival.y === 'number') {
            const rv = fin.rival;
            const spd = typeof rv.spd === 'number' ? rv.spd : 3;
            const dd = Math.hypot(p.x - rv.x, p.y - rv.y) || 1;
            out.rival = { x: rv.x, y: rv.y, d: dd };
            out.enemies.push({
                x: rv.x, y: rv.y,
                vx: (p.x - rv.x) / dd * spd, vy: (p.y - rv.y) / dd * spd,   // it chases US
                r: 30, reach: 280, w: 5, boss: false, wall: false, stationary: false, rival: true
            });
            out.mix.boss++; out.mix.total++;
        }

        return out;
    }

    // distance from point (px,py) to the segment (x1,y1)->(x2,y2) — used to
    // cost the whole TRAVEL PATH of a candidate step against small contact
    // hazards, so the planner can't cut straight through them to the far side
    function distPointSeg(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const l2 = dx * dx + dy * dy || 1;
        let t = ((px - x1) * dx + (py - y1) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function lineCost(l, x, y) {
        // roadLines are charge lanes. REAL game shape (source-verified via the
        // Last Call Linebacker): {x, y, ang, armed, dmg} — an angled RAY
        // through (x,y); the game's own hit test is perpendicular distance.
        const pad = CONFIG.threat.linePad;
        try {
            if (typeof l.ang === 'number' && typeof l.x === 'number' && typeof l.y === 'number') {
                const perp = Math.abs((y - l.y) * Math.cos(l.ang) - (x - l.x) * Math.sin(l.ang));
                // SOURCE-VERIFIED (live diagnostics, 547-run line-death audit):
                // the game's own hit test is `perp < 63` — the lane kills 63px
                // to EACH side of the ray, not 18. The old model told the bot
                // the outer 35-60px band was safe; it died there in 25 of the
                // last 30 runs. Width = the game's 63 + our pad.
                const width = 63 + pad;
                // GRADED, not binary: the lane can be wider than one planner
                // step, so a flat cost makes every direction look equally
                // doomed. A gradient means stepping outward ALWAYS pays.
                return perp >= width ? 0 : 1 - (perp / width) * 0.85;
            }
            if (typeof l.x === 'number' && typeof l.w === 'number' && typeof l.h === 'number') {
                return (x > l.x - pad && x < l.x + l.w + pad && y > l.y - pad && y < l.y + l.h + pad) ? 1 : 0;
            }
            if (typeof l.x1 === 'number' && typeof l.y1 === 'number') {
                const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
                const len2 = dx * dx + dy * dy || 1;
                let t = ((x - l.x1) * dx + (y - l.y1) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                const px = l.x1 + t * dx, py = l.y1 + t * dy;
                return Math.hypot(x - px, y - py) < (l.thickness || l.w || 26) / 2 + pad ? 1 : 0;
            }
            if (typeof l.y === 'number' && typeof l.x !== 'number') {
                return Math.abs(y - l.y) < (l.thickness || 26) / 2 + pad ? 1 : 0;
            }
            if (typeof l.x === 'number' && typeof l.y !== 'number') {
                return Math.abs(x - l.x) < (l.thickness || 26) / 2 + pad ? 1 : 0;
            }
        } catch (e) { }
        return 0;
    }

    function gatherLoot(p, hpRatio) {
        const out = [];
        const ps = G.pickups;
        if (!Array.isArray(ps)) return out;
        let floorCount = 0;
        for (const it of ps) if (it && it.taken !== true && it.dead !== true) floorCount++;
        for (const it of ps) {
            if (!it || typeof it.x !== 'number' || typeof it.y !== 'number') continue;
            if (it.taken === true || it.dead === true) continue;
            if (Math.hypot(it.x - p.x, it.y - p.y) > CONFIG.movement.lootRange) continue;
            const kind = String(it.kind || it.type || '_default').toLowerCase();
            let v = PICKUP_VALUE[kind] ?? PICKUP_VALUE._default;
            let vital = false;
            if (kind === 'health') {
                v = 10 + 70 * (1 - hpRatio);   // near-worthless at full HP, urgent when low
                vital = hpRatio < 0.6;         // hurt: healing must BYPASS every greed discount
            } else if (kind === 'timestop' || kind === 'firecross' || kind === 'tequila') {
                // Battlefield consumables (timestop freeze, firecross burn,
                // tequila shot) activate ON PICKUP. Grabbing one on an empty
                // field wastes it — value scales with how hot the field is
                // right now (crowd size / losing the DPS race).
                const heat = Math.max(Math.min(1, enemyMix.total / 25), dpsDeficit);
                v = 6 + Math.round(34 * heat);
                // USER-OBSERVED WINNING TACTIC: in hell, chaining time stops
                // and tequila/flame bursts is what outlasts the boss rush
                // when the rainbow gun isn't up yet — these drops become
                // top-priority loot the moment the run crosses into hell.
                if (hellDetected) v += (kind === 'timestop' ? 20 : 14);
                // USER: FLAME CROSS is essential for melting NO BOOKING
                // walls and passout fields — grab it when those targets are up.
                if (kind === 'firecross' && lastPlan) {
                    // USER PRIORITY ORDER for the flame cross: passouts
                    // FIRST, then NO BOOKING walls and bosses, then charge
                    // lanes — the early roster is too weak to melt these,
                    // the cross does it for free. Day phase values it most.
                    const gtF = typeof G.gameTime === 'number' ? G.gameTime : 0;
                    const day = gtF < 1200 && !hellDetected;
                    if ((lastPlan.passoutsNear || 0) >= 1) v += day ? 28 : 18;
                    else if (lastPlan.wallNear === true || lastPlan.bossNear === true) v += day ? 20 : 14;
                    else if ((lastPlan.lines || 0) > 0) v += 12;
                }
            } else if (kind === 'magnet') {
                // Magnet hoovers the floor: worth more the more loot is out.
                v = 8 + Math.min(26, floorCount * 2);
            } else if (kind === 'tip' || kind === 'bottle') {
                // USER-VERIFIED: boss tips carry ROSTER UPGRADES — the
                // highest-leverage loot in the game. Grab them, especially
                // early, where one upgrade compounds for the whole run.
                v = 40 + (gamePhase() === 'early' ? 10 : 0) + Math.round(8 * dpsDeficit);
            } else if (kind === 'coin' || kind === 'bill') {
                // Gold buys weapon upgrades — when we're losing the damage
                // race, gold IS damage. Scale it up with the deficit.
                v += Math.round(8 * dpsDeficit);
            }
            // FLIGHT: a time-stop pickup is the only thing that ends an
            // unkillable chase — it outvalues everything else on the floor.
            if (flightRef.v) {
                if (kind === 'timestop') v = 400;
                else if (kind === 'firecross' || kind === 'tequila') v = Math.round(v * 1.6);
                else if (!vital) v = Math.round(v * 0.3);
            }
            out.push({ x: it.x, y: it.y, v, vital, kind });
        }
        return out;
    }

    function planMove() {
        const p = G.player;
        if (!p) { moveSource = 'no player binding'; return null; }
        const { w: fw, h: fh } = fieldSize();
        const M = CONFIG.movement, T = CONFIG.threat;

        const maxHp = p.maxHp || p.maxHealth || p.hpMax || 100;
        const hp = p.hp != null ? p.hp : (p.health != null ? p.health : maxHp);
        const hpRatio = Math.max(0, Math.min(1, hp / (maxHp || 1)));

        // FLAME CROSS ACTIVE (user: stand more ground): while the cross burns,
        // everything near the bot dies — fear drops, farming intensifies, the
        // standoff tightens so the burn zone stays ON the crowd.
        const frameNow = safe(() => frame, 0) || 0;
        const flameOn = typeof p.fireCrossUntil === 'number' && p.fireCrossUntil > frameNow;

        if (hellDetected) applyHellUnban();   // v6.83.0: fifth-super key opens in hell
        const th = gatherThreats(p);
        const loot = gatherLoot(p, hpRatio);

        // UPGRADE/LOOT SYNC (user directive): the build must hit its power
        // marks ON TIME — roughly the first super by ~11 min and six by the
        // rainbow window. BUILD HUNGER measures how starved the build is
        // (long gap since the last level-up, or supers behind the timetable
        // pace) and re-weights the whole loot hunt toward XP, tips, and
        // farm kills until the cadence recovers.
        const gtH = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const cadenceHunger = Math.min(1, Math.max(0, (Date.now() - (lastLevelUpAt || Date.now())) / 45000));
        const expectedSupers = Math.max(0, Math.min(6, (gtH - 480) / 160));
        const paceHunger = Math.min(1, Math.max(0, (expectedSupers - supersThisRun) / 2));
        const buildHunger = Math.max(cadenceHunger, paceHunger);
        if (buildHunger > 0.25) {
            for (const it of loot) {
                if (['xp', 'gem', 'exp', 'star', 'ingredient', 'bottle', 'tip'].includes(it.kind))
                    it.v *= 1 + 0.7 * buildHunger;   // XP and upgrade currency first when starving
            }
        }

        // GUARDED LOOT: an item whose straight path crosses a passout's body
        // would drag the bot into contact damage (source-verified: passouts
        // hurt on touch). Mute its pull — the ring farm kills the passout and
        // frees the loot in a moment. VITAL heals keep full pull: one contact
        // tick is a fair price when the alternative is dying.
        for (const it of loot) {
            if (it.vital) continue;
            for (const po of th.passouts) {
                if (distPointSeg(po.x, po.y, p.x, p.y, it.x, it.y) < po.r + 18) { it.v *= 0.15; break; }
            }
        }

        // Enemy-mix telemetry (rolling, decayed): what we're fighting shapes
        // both movement weights (below) and upgrade choices (scoreCard).
        for (const k in enemyMix) enemyMix[k] *= 0.98;
        for (const k in th.mix) enemyMix[k] += th.mix[k];
        const mixShare = k => enemyMix.total > 4 ? enemyMix[k] / enemyMix.total : 0;
        // Ranged-heavy waves → dodge projectiles harder; bomber-heavy waves →
        // respect telegraphed AoE more; swarm-heavy waves → kite wider.
        // HELL BUFFERS (user + data: hell runs die 50-76s past the finale,
        // to proj/mark/contact, INSIDE the entry surge): every hazard class
        // gets a hell multiplier so the movement posture hardens the moment
        // the run crosses into hell — not just for the 90s entry window.
        const hellMul = hellDetected ? 1.3 : 1;
        const projW = T.projWeight * (1 + Math.min(1, 2 * mixShare('ranged'))) * hellMul;
        const markW = T.markWeight * (1 + Math.min(1, 3 * mixShare('bomber'))) * hellMul;
        const standoffAdj = M.standoff * (1 + 0.3 * Math.min(1, mixShare('swarm'))) * (hellDetected ? 1.15 : 1) *
            (flameOn ? 0.75 : 1);   // flame active: tighten in, keep the crowd burning

        // ---- Enemy scaling: MEASURE the difficulty curve ----------------
        // Kill rate (our real DPS output, kills/sec, rolling):
        const kc = G.killCount, nowMs = Date.now();
        if (typeof kc === 'number') {
            if (lastKillCount != null && nowMs > lastKillAt) {
                const inst = Math.max(0, kc - lastKillCount) / ((nowMs - lastKillAt) / 1000);
                killRate = killRate * 0.95 + inst * 0.05;
            }
            lastKillCount = kc; lastKillAt = nowMs;
        }
        // Spawn pressure and enemy toughness (their HP curve, measured live):
        pressureAvg = pressureAvg * 0.97 + th.near * 0.03;
        passoutAvg = passoutAvg * 0.97 + th.passouts.length * 0.03;
        if (th.hpN) toughnessAvg = toughnessAvg * 0.97 + (th.hpSum / th.hpN / 30) * 0.03;
        // Are we losing the damage race? 0 = cruising, 1 = falling behind.
        dpsDeficit = Math.max(0, Math.min(1,
            0.6 * Math.min(1, pressureAvg / 6) +
            0.4 * Math.min(1, Math.max(0, toughnessAvg - 1)) -
            0.5 * Math.min(1, killRate / 2)));
        // Late-game enemies hit harder: widen caution with elapsed time and
        // measured toughness, and start panicking at higher HP.
        const late = Math.min(1, (typeof G.gameTime === 'number' ? G.gameTime : 0) / 1200);
        // Hell-entry onslaught: enterHell() resets spawn timers and queues a
        // surge + first boss immediately — the data shows runs dying 1–2 min
        // after entry. Maximum caution for the first 90 seconds of hell.
        const hellRecent = hellDetected && hellEnteredAt && (Date.now() - hellEnteredAt) < 90000;
        // DEEP-HELL DEPTH (v6.82.0): 0 before CONFIG.deepHell.startS, 1 at
        // fullS. Drives the contact posture below — nothing else.
        const DH = CONFIG.deepHell;
        const gtDeepP = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const depth = hellDetected ? Math.max(0, Math.min(1, (gtDeepP - DH.startS) / Math.max(1, DH.fullS - DH.startS))) : 0;
        // FRESH-GUN WINDOW (user-verified): for ~2.5 min after taking the
        // Rainbow Gun, DPS has cratered and normal play gets the bot killed
        // on contact — survival posture only until the gun scales up.
        const rainbowRecent = rainbowThisRun && rainbowAt && (Date.now() - rainbowAt) < 150000;
        // Surge awareness: the game's own surge window is readable.
        const su = G.surgeUntil, gt = G.gameTime;
        const surgeActive = typeof su === 'number' && typeof gt === 'number' && su > gt;
        const caution = (1 + 0.4 * late + 0.3 * Math.min(1, Math.max(0, toughnessAvg - 1))) *
            (hellDetected ? M.hellCautionMul : 1) *
            (hellRecent ? 1.35 : 1) *
            (rainbowRecent ? 1.35 : 1) *
            (surgeActive ? 1.25 : 1) *
            (flameOn ? 0.72 : 1);   // the burn IS the shield: hold the fray

        // death-cause telemetry. LIVE-AUDIT FIX: pure exposure counting
        // misattributed deaths badly (standing NEAR a wide lane logged 'line'
        // every tick while actual damage came from elsewhere — 28/30 'line'
        // verdicts vs ZERO observed lane hits in a 4-minute ground-truth
        // audit). Exposure now counts at 0.25 weight; REAL hp drops are
        // classified against the hazards actually in range and weighted by
        // damage taken, so the death verdict follows the damage.
        for (const k in dangerAccum) dangerAccum[k] *= 0.96;
        for (const e of th.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) { dangerAccum.contact += 0.25; break; }
        for (const q of th.projectiles) if (Math.hypot(q.x - p.x, q.y - p.y) < q.r * 2.5) { dangerAccum.proj += 0.25; break; }
        for (const m of th.marks) if (Math.hypot(m.x - p.x, m.y - p.y) < m.r) { dangerAccum.mark += 0.25; break; }
        for (const l of th.lines) if (lineCost(l, p.x, p.y)) { dangerAccum.line += 0.25; break; }
        if (lastHpSample != null && hp < lastHpSample - 0.5) {
            const loss = lastHpSample - hp;
            let cls = 'contact';
            if (th.rival && th.rival.d < 150) cls = 'rival';
            else if (th.lines.some(l => l.armed === true && lineCost(l, p.x, p.y) > 0.15)) cls = 'line';
            else if (th.projectiles.some(q => Math.hypot(q.x - p.x, q.y - p.y) < q.r + 22)) cls = 'proj';
            else if (th.marks.some(m => Math.hypot(m.x - p.x, m.y - p.y) < m.r + 10)) cls = 'mark';
            dangerAccum[cls] = (dangerAccum[cls] || 0) + loss * 0.35;
        }
        lastHpSample = hp;

        // LATE-DAY FIX (user: passouts not cleared 15-20 min): 'panic' used
        // to trigger on CROWD COUNT alone, which is just the normal state of
        // a dense late-day field — it was turning all farming off exactly
        // when the loot matters most. hpPanic = actually hurt; panic (crowd
        // included) still governs movement caution and loot greed.
        // v6.85.0: a tank panics later (more HP to spend), a runner sooner
        const hpPanic = hpRatio < M.panicHp * charOf().panicMul * (1 + 0.25 * late);
        // USER: NEGRONI + OLIVE make mob rushes survivable — every 3 combined
        // defense levels raise the crowd threshold by 1, so an armored bot
        // keeps farming bosses/passouts/walls through a rush instead of
        // sprinting for a corner.
        const crowdTol = M.crowdedCount +
            Math.round(((ownedLevels['NEGRONI'] || 0) + (ownedLevels['OLIVE'] || 0)) / 3) +
            ((hellDetected || (typeof G.gameTime === 'number' && G.gameTime > 1200)) ? 4 : 0) +
            // DEEP-HELL CALIBRATION: the manual run's MEDIAN crowd at 200
            // minutes was 44 within 90px (p90 219) at 100% HP — density at
            // depth is the working environment, never an emergency.
            (hellDetected ? Math.round(Math.min(40, Math.max(0, ((typeof G.gameTime === 'number' ? G.gameTime : 0) - 1800) / 120))) : 0);
        // v6.85.2: a tank profile (charOf().crowdPanic === false) ignores crowd
        // COUNT entirely and panics on HP alone. Measured: Pat held station at
        // 100 HP through 50-99 near in the day and 102-156 near in hell, with
        // freeze up, taking zero damage. crowdTol still drives the gap-escape
        // and loot-greed terms below for every profile.
        const crowdPanic = charOf().crowdPanic !== false && th.near >= crowdTol;
        const panic = hpPanic || crowdPanic;
        const lootMul = M.lootPull * (panic ? M.panicLootDiscount : 1) *
            (hellRecent ? 0.3 : 1) *      // hell entry: survival only, greed later
            (surgeActive ? 0.6 : 1) *     // surges: dodge first, loot after
            (th.rival ? 0.25 : 1) *       // rival chase: RUN, loot later
            (rainbowRecent ? 0.4 : 1);    // fresh gun: survive first, loot when it scales

        const slowMul = (typeof p.slowMul === 'number' && p.slowMul > 0 && p.slowMul <= 1) ? p.slowMul : 1;
        // SLOW-SCALED MARGINS (demo: slow exposure jumps 15%->40% at hell
        // entry, and the manual run answers by WIDENING every distance, never
        // by dashing). Halved speed = ~1.5x the reaction distance needed.
        const slowPad = Math.min(1.6, 1 + (1 - slowMul) * 1.2);
        slowPadRef.v = slowPad;
        th_nearRef.v = th.near;
        const speed = ((typeof p.speed === 'number' && p.speed > 0) ? p.speed : M.playerSpeed) * slowMul;   // freeze auras SLOW us — plan with real mobility
        const stepFrames = M.lookaheadMs / 16.67;
        const step = speed * stepFrames;
        const projDt = T.projLookaheadMs / 16.67;

        // Crowd centroid for kiting/standoff: CHASING mobs only. Walls and
        // stationary bosses don't move, so including them would bend the kite
        // circle toward things that never follow.
        let cx = 0, cy = 0, chasers = 0;
        for (const e of th.enemies) {
            if (e.wall || (e.boss && e.stationary)) continue;
            cx += e.x; cy += e.y; chasers++;
        }
        if (chasers) { cx /= chasers; cy /= chasers; }

        // KITING: with a real crowd on the field, the winning pattern is to
        // sweep TANGENTIALLY around it so the swarm forms a trailing line —
        // holding a static standoff lets a spread crowd envelop you. Keep the
        // tangent that continues the current sweep direction.
        // SOUTH SIDE ZONING (user directive): flame rain leaves burning
        // ground that damages enemies WALKING OVER it — the weapon pays when
        // the chase train is dragged across the lingering zones. Owning it
        // switches kiting to aggressive: engage earlier (2 chasers), sweep
        // harder, and never stand parked on cooled ground.
        const zoner = (ownedLevels['SOUTH SIDE'] || 0) > 0 || [...supersMade].some(n => /SOUTH\s*SIDE/i.test(n));
        // SUPER VODKA CRANBERRY (user directive): its whip KNOCKS BOSSES
        // BACK — with the super made, holding the firing ring is safe even
        // against bosses that outrun us, and kiting near bosses drags them
        // through SOUTH SIDE burn zones for the full combo.
        // KNOCKBACK (user, source of contact-damage relief): the super whip,
        // or EITHER VODKA CRANBERRY / MOSCOW MULE at level 6 — all shove
        // bosses off us, which is what makes a ring holdable at all.
        const knocker = [...supersMade].some(n => /VODKA\s*CRANBERRY|MOSCOW\s*MULE/i.test(n)) ||
            (ownedLevels['VODKA CRANBERRY'] || 0) >= 6 || (ownedLevels['MOSCOW MULE'] || 0) >= 6;
        let kite = null;
        if (chasers >= ((zoner || rainbowRecent) ? 2 : 3) && !panic) {
            const rx = p.x - cx, ry = p.y - cy;
            const rm = Math.hypot(rx, ry) || 1;
            const t1 = { x: -ry / rm, y: rx / rm }, t2 = { x: ry / rm, y: -rx / rm };
            kite = (t1.x * lastDir.x + t1.y * lastDir.y) >= (t2.x * lastDir.x + t2.y * lastDir.y) ? t1 : t2;
        }

        // GAP ESCAPE: when surrounded, find the widest angular gap between
        // nearby enemies and drive through it — greedy per-direction danger
        // alone can leave every option looking equally bad.
        let escape = null;
        if (th.near >= crowdTol) {
            const angs = [];
            for (const e of th.enemies) {
                if (Math.hypot(e.x - p.x, e.y - p.y) < 140) angs.push(Math.atan2(e.y - p.y, e.x - p.x));
            }
            if (angs.length >= 2) {
                angs.sort((a, b) => a - b);
                let bestGap = 0, bestMid = null;
                for (let i = 0; i < angs.length; i++) {
                    const a = angs[i];
                    const b = i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2;
                    if (b - a > bestGap) { bestGap = b - a; bestMid = (a + b) / 2; }
                }
                if (bestMid != null) escape = { x: Math.cos(bestMid), y: Math.sin(bestMid) };
            }
        }

        // IMMINENT-IMPACT check (data: projectiles cause ~2/3 of deaths):
        // closest-approach prediction against our CURRENT position, homing-
        // corrected — if anything connects within ~0.3s, the dash fires now.
        // LANE-URGENT check (data: lanes now cause ~72% of deaths): standing
        // ON an armed charge lane means walking out is too slow — dash out.
        // RIVAL-URGENT: the chase rival closing in = a half-max-HP hit
        // incoming — dash away well before contact.
        const rivalUrgent = !!(th.rival && th.rival.d < 160);   // live audit: both 1200s deaths were the chase — bail earlier
        // FREEZE ESCAPE: slowed with a boss closing = walking is no longer an
        // option — the dash is the only exit from the aura.
        // FROZEN = caught in the two-top's pair field (or any hard freeze):
        // walking out is impossible, the dash is the only exit.
        const hardFrozen = p.frozen === true || slowMul <= 0.61;
        const frozenUrgent = hardFrozen ||
            (slowMul < 0.7 && th.enemies.some(e => e.boss && !e.wall && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 55));
        // LATE-HELL SPRINTERS (user): mobs faster than even minguk closing
        // to contact range = dash through/past them, don't try to outwalk.
        const sprinterUrgent = hellDetected &&
            th.enemies.some(e => !e.wall && !e.boss && e.chaserFast && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 80);

        let laneUrgent = false;
        for (const l of th.lines) {
            const inBand = lineCost(l, p.x, p.y);
            if (inBand <= 0.15) continue;                 // clear of this lane
            if (l.armed === true) { laneUrgent = true; break; }   // charge is LIVE: go now
            // TELEGRAPH WINDOW (source: 210-frame life, arms for the last 90).
            // Standing in the band as it approaches arming is the moment to
            // dash — once it arms, walking out is already too late.
            if (typeof l.life === 'number' && l.life <= 130) { laneUrgent = true; break; }
            // no life field to read: treat deep-in-band telegraphs as urgent
            if (inBand > 0.55) { laneUrgent = true; break; }
        }

        let projImminent = false;
        for (const q of th.projectiles) {
            let pvx = q.vx, pvy = q.vy;
            if (q.home) {
                const dd = Math.hypot(p.x - q.x, p.y - q.y) || 1;
                pvx = (p.x - q.x) / dd * q.home;
                pvy = (p.y - q.y) / dd * q.home;
            }
            const sp2 = pvx * pvx + pvy * pvy;
            if (sp2 < 0.25) continue;
            const t = ((p.x - q.x) * pvx + (p.y - q.y) * pvy) / sp2;   // frames to closest approach
            if (t > 0 && t < 18) {
                const cax = q.x + pvx * t, cay = q.y + pvy * t;
                if (Math.hypot(cax - p.x, cay - p.y) < q.r + 6) { projImminent = true; break; }
            }
        }

        // USER PRIORITY: an uncontested NO BOOKING wall on the field is THE
        // kill target — everything else (passouts, boss rings) waits.
        const wallFocus = th.enemies.some(e => e.wall && !e.contested);
        // FARM ANCHOR (user: stop running from mobs when armored + ult in
        // hand): a farmable target in range + real defense = PLANT AND KILL.
        // TELEMETRY REBALANCE (12/30 recent deaths = marks, zero supers,
        // zero hell entries): the anchor was out-bidding telegraphed blasts.
        // It now requires 70%+ HP and SUSPENDS while a mark overlaps the
        // stand position — plant on loot, never inside a falling attack.
        // PAUSE STATE: how much of the nearby field is frozen right now.
        // A live pause makes dashing pointless; no pause in hell means
        // unkillable-scaled bodies are actually moving at us.
        let frozenNear = 0, movingNear = 0;
        for (const e of th.enemies) {
            if (e.wall) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) > 200) continue;
            if (e.frozen) frozenNear++; else movingNear++;
        }
        const pauseActive = frozenNear > 0 && movingNear <= Math.max(1, Math.round(frozenNear * 0.25));

        // FLIGHT MODE: in hell, with no pause holding the field and the
        // bodies scaled past killable, fighting is not an option — run,
        // dash, and get to a time-stop pickup. Pause ends it.
        const unkillable = toughnessAvg > 25 || (killRate < 0.8 && th.near >= 6);
        const flight = hellDetected && !pauseActive && unkillable && th.near >= 4 && !hpPanic;
        flightRef.v = flight;

        // v6.85.2: falling-passout drops excluded — see the `drop` tag above.
        const markHere = th.marks.some(m => !m.drop && Math.hypot(m.x - p.x, m.y - p.y) < m.r + 50);
        // live enemy fire anywhere near us: do NOT plant — keep moving
        const projHere = th.projectiles.some(q =>
            Math.hypot(q.x - p.x, q.y - p.y) < q.r + 130);
        const dayPhaseNow = !hellDetected && (typeof G.gameTime === 'number' ? G.gameTime : 0) < 1200;
        // v6.85.0: a tank plants on a busier field than a runner would
        const anchor = !hpPanic && hpRatio > 0.7 && !markHere && !projHere && !th.rival && !rainbowRecent && !flight &&
            (!dayPhaseNow || th.near <= 2 + charOf().anchorBias * 2) &&   // day: only anchor on a quiet field (manual run: crowd median 0)
            ((ownedLevels['OLIVE'] || 0) >= 2 || (ownedLevels['NEGRONI'] || 0) >= 2) &&
            (wallFocus || th.passouts.some(po => !po.contested && Math.hypot(po.x - p.x, po.y - p.y) < 220));
        // USER-VERIFIED: Corpse Reviver zombies can hit NEITHER passouts NOR
        // no-booking walls — a CR-only build farms both at base-attack speed,
        // so the detour incentive is cut for each. (Hoisted out of the
        // candidate loop — audit fix: was recomputed 33x per tick, twice.)
        const crOnly = (ownedLevels['CORPSE REVIVER No.2'] || 0) > 0 && ownedCocktailCount() === 1;
        const crOnlyW = crOnly;
        // USER DIRECTIVE: the first 20 minutes are the FUNDING phase — kill
        // every NO BOOKING wall, passout, and boss to bankroll the rainbow
        // path before the finale. Farm pulls are amplified until 1200s.
        // ...and MINUTE ONE is the sprint (user directive): kill mobs and
        // passouts flat-out so the first attack upgrade lands BEFORE the
        // first NO BOOKING wall spawns on the timetable.
        const gtNow2 = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const dayFarm = ((!hellDetected && gtNow2 < 60) ? 1.7 : ((gtNow2 < 1200 && !hellDetected) ? 1.35 : 1)) *
            (1 + 0.45 * buildHunger) *  // starving build: kills ARE the upgrades — hunt harder
            (flameOn ? 1.3 : 1) *       // burn window: harvest everything it touches
            (flight ? 0.15 : 1);        // FLIGHT: nothing is worth stopping for

        // ULT CENTERING (user: the ultimate spirals outward from the bot —
        // fired from the MIDDLE of a passout group it hits everything):
        // compute the centroid of farmable passouts in range; the anchor
        // pulls the bot onto it before the ult fires.
        let poCx = 0, poCy = 0, poN = 0;
        for (const po of th.passouts) {
            if (po.contested) continue;
            if (Math.hypot(po.x - p.x, po.y - p.y) < 240) { poCx += po.x; poCy += po.y; poN++; }
        }
        if (poN) { poCx /= poN; poCy /= poN; }

        // CONTACT IMMINENT (hell): a live body whose predicted step lands on
        // us. In hell these scale past what the supers can kill, so the only
        // answers are the dash and the ult's invincibility window.
        let contactImminent = false;
        if (hellDetected && !pauseActive) {
            const horizon = 12 + (DH.horizonFrames - 12) * depth;   // deep hell: see the lunge earlier
            for (const e of th.enemies) {
                if (e.wall || e.frozen) continue;
                const fx2 = e.x + e.vx * horizon, fy2 = e.y + e.vy * horizon;   // ~0.2s ahead (longer at depth)
                const pad = ((e.boss || e.rival) ? 26 : 12) * (1 + (DH.bossPadMul - 1) * depth);
                if (Math.hypot(fx2 - p.x, fy2 - p.y) < e.r + pad) { contactImminent = true; break; }
            }
        }

        // TIME-STOP STACKING (user): during an item time pause in hell with
        // SOUTH SIDE owned, the paused boss is a free damage sponge — stand
        // ON it and let the burn zones stack. Only while the freeze has
        // ≥0.75s left (the karaoke lesson: leave BEFORE it wakes).
        let stopBoss = null;
        if (hellDetected && zoner && !projHere) {
            for (const e of th.enemies) {
                if (!e.boss || e.wall || !e.frozen || e.frozenLeft < 45) continue;
                const dd = Math.hypot(e.x - p.x, e.y - p.y);
                if (!stopBoss || dd < stopBoss.d) stopBoss = { x: e.x, y: e.y, d: dd, r: e.r };
            }
        }

        let best = null;
        const N = M.samples;
        for (let i = 0; i <= N; i++) {
            let dx, dy;
            if (i === N) { dx = 0; dy = 0; }              // the "stand still" candidate
            else { const a = (i / N) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }

            const nx = Math.max(0, Math.min(fw, p.x + dx * step));
            const ny = Math.max(0, Math.min(fh, p.y + dy * step));

            let danger = 0;

            for (const e of th.enemies) {
                const fx = e.x + e.vx * stepFrames;
                const fy = e.y + e.vy * stepFrames;
                const d = Math.hypot(nx - fx, ny - fy);
                // a SAFELY frozen boss during the stacking window is not a
                // threat — it is the target; skip all its repulsion costs
                if (stopBoss && e.frozen && e.frozenLeft >= 45 && e.boss && !e.wall) continue;
                if (e.wall) {
                    // Impassable and pins you, but never chases. USER REPORT:
                    // the bot was bumping into walls mid-siege — the old cost
                    // was a binary cliff at r+8, so the planner parked 1px
                    // outside it and jitter shoved it in. Now: a hard
                    // no-touch core, a GRADED approach band above it, and a
                    // path check so no step cuts across the body.
                    if (d < e.r + 10) danger += 90;
                    else if (d < e.r + 26) danger += 30 * (1 - (d - e.r - 10) / 16);
                    else if (distPointSeg(fx, fy, p.x, p.y, nx, ny) < e.r + 10) danger += 90;
                    continue;
                }
                // CONTACT BUFFER (user-verified: ALL bosses deal contact
                // damage): the hitbox itself is maximal cost, and a graded
                // band just outside it — wider for bosses, whose bodies both
                // hit harder and lunge — keeps the bot from grazing.
                // DEEP HELL (v6.82.0): giant bosses lunge further than their
                // sprite — the graded band and the fear radius widen with depth
                const deepBand = (e.boss || e.rival) ? (1 + (DH.bossPadMul - 1) * depth) : 1;
                const cpad = (e.rival ? 40 : (e.boss ? (e.chaserFast ? 40 : 24) : 10)) * deepBand;
                const reachD = e.reach * ((e.boss && !e.wall) ? (1 + (DH.reachMul - 1) * depth) : 1);
                if (d < e.r) danger += (e.rival ? 90 : 40) * e.w * caution;             // contact hurts more late-game; rival = half max HP
                else if (d < e.r + cpad) danger += (e.rival ? 45 : (e.boss ? 26 : 10)) * e.w * caution * (1 - (d - e.r) / cpad);
                else if ((e.boss || e.rival) && distPointSeg(fx, fy, p.x, p.y, nx, ny) < e.r)
                    danger += 40 * e.w * caution;                                       // stepping THROUGH a boss body still hurts
                else if (d < reachD) danger += T.enemyWeight * caution * e.w *
                    ((reachD - d) / reachD) * 6 * (e.stationary ? 0.45 : 1) * ((e.boss && !e.stationary) ? 1.25 : 1) *
                    ((anchor && !e.boss && !e.rival) ? 0.65 : 1);   // anchored: commons don't push us off the farm
            }

            for (const q of th.projectiles) {
                // HOMING projectiles chase the player — predict along the
                // pursuit vector, not the (possibly misleading) current vx/vy.
                let pvx = q.vx, pvy = q.vy;
                if (q.home) {
                    const dd = Math.hypot(p.x - q.x, p.y - q.y) || 1;
                    pvx = (p.x - q.x) / dd * q.home;
                    pvy = (p.y - q.y) / dd * q.home;
                }
                // PERSISTENT FLOATING HAZARDS (source-verified: the feed
                // boss's posts sit at vx=vy=0 with 300+ frames of life and
                // damage on bump): a static projectile is a NO-GO disc, not
                // a passing threat — pad it and route around, graded band.
                if (!q.home && (pvx * pvx + pvy * pvy) < 0.09) {
                    const rr = q.r + T.projPad;
                    const dNowH = Math.hypot(p.x - q.x, p.y - q.y);
                    const dEnd = Math.hypot(nx - q.x, ny - q.y);
                    if (dNowH < rr) {
                        // already overlapping: pure RETREAT gradient — every
                        // px of separation lowers cost, so walking out always
                        // ranks above sliding along or through it
                        danger += projW * q.w * 12 * (1 - Math.min(1, dEnd / (rr + 26)));
                    } else if (dEnd < rr || distPointSeg(q.x, q.y, p.x, p.y, nx, ny) < rr) {
                        danger += projW * q.w * 12;      // don't enter, don't cut through
                    } else if (dEnd < rr + 26) {
                        danger += projW * q.w * 3 * (1 - (dEnd - rr) / 26);
                    }
                    continue;
                }
                // SMOOTH OPERATOR (user report): a homing phone that misses
                // TURNS AROUND — its current heading is never an all-clear.
                // Close range around a live homing projectile is a no-go
                // disc on top of the path prediction, which naturally makes
                // PERPENDICULAR jukes the cheapest escape.
                if (q.home) {
                    const dq = Math.hypot(nx - q.x, ny - q.y);
                    if (dq < q.r + 28) danger += projW * q.w * 6 * (1 - dq / (q.r + 28));
                }
                // sample along the projectile's path, not just its endpoint
                for (let k = 0.25; k <= 1.0001; k += 0.25) {
                    const px = q.x + pvx * projDt * k;
                    const py = q.y + pvy * projDt * k;
                    const d = Math.hypot(nx - px, ny - py);
                    if (d < q.r) { danger += projW * q.w * 14 * (1.1 - k); break; }
                    if (d < q.r * 2.4) danger += projW * q.w * 2 * (1.1 - k);
                }
            }

            for (const m of th.marks) {
                const d = Math.hypot(nx - m.x, ny - m.y);
                // URGENCY: full weight once the fuse is short, tapering for
                // blasts still most of a second away (there is time to route).
                const urg = (typeof m.tLeft === 'number')
                    ? (m.tLeft <= 0.35 ? 1.6 : m.tLeft <= 0.7 ? 1.15 : 0.8)
                    : 1;
                // DEPTH-SCALED (v6.84.0): marks rose to 27% of deaths in the
                // deep-run version. Both the radius we route around and the
                // weight we give it widen with hell depth.
                const mR = m.r * (1 + (DH.markPadMul - 1) * depth);
                const mW = markW * (1 + (DH.markWeightMul - 1) * depth);
                if (d < mR) danger += mW * 16 * urg;
                else if (d < mR * 1.5) danger += mW * 3 * urg;
            }

            // armed lanes are lethal NOW; unarmed ones are telegraphs — still
            // strongly worth pre-dodging before the charge fires
            for (const l of th.lines) danger += lineCost(l, nx, ny) * T.lineWeight * hellMul * (l.armed === true ? 14 : 7);

            // Walls pin you when a crowd is pushing: the effective margin
            // widens with nearby pressure so the bot never kites into a corner.
            const mg = CONFIG.field.margin * (1 + 0.8 * Math.min(1, th.near / 6));
            const edge = Math.min(nx, ny, fw - nx, fh - ny);
            if (edge < mg) danger += M.wallWeight * (mg - edge) * 0.9;

            let gain = 0;
            for (const it of loot) {
                const d0 = Math.hypot(p.x - it.x, p.y - it.y);
                const d1 = Math.hypot(nx - it.x, ny - it.y);
                // VITAL pickups (healing while hurt) bypass every greed
                // discount — panic and the hell-entry window suppress loot
                // exactly when a heal is most valuable, which was backwards.
                const pull = it.vital ? M.lootPull * 1.2 : lootMul;
                gain += pull * it.v * (d0 - d1) / Math.max(30, d0);
            }

            // Siege the NO BOOKING walls: they never chase, they block the
            // map, and killing them pays gold + XP. Hold a firing ring just
            // outside their contact zone so weapons melt them — the hard
            // don't-touch cost above still keeps us off their hitbox.
            // USER PRIORITY: when a NO BOOKING mob is up, killing it comes
            // FIRST — its siege pull is boosted and every other farm pull
            // (passouts, boss rings) is muted until it's down (wallFocus).
            if (!hpPanic && !hellRecent && !th.rival && !rainbowRecent) {
                for (const e of th.enemies) {
                    if (!e.wall || e.contested) continue;
                    // firing ring sits OUTSIDE the graded contact band — and
                    // DEMO-TUNED: with a sniper/directed weapon leveled the
                    // user sieges walls from ~280px; the body never closes.
                    const ranged = (ownedLevels['MOJITO'] || 0) >= 3 || (ownedLevels['VODKA MARTINI'] || 0) >= 3;
                    const ring = ranged ? e.r + 140 : e.r + 38;
                    const errNow = Math.abs(Math.hypot(p.x - e.x, p.y - e.y) - ring);
                    const errNew = Math.abs(Math.hypot(nx - e.x, ny - e.y) - ring);
                    gain += M.wallSiegeValue * (wallFocus ? 2.4 : 1) * dayFarm * (crOnlyW ? 0.4 : 1) * (errNow - errNew) * 0.15;
                }
            }

            // Boss engagement: boss kills pay big loot (user-verified), so at
            // healthy HP hold the edge of the boss's threat radius — weapons
            // keep hitting it — instead of drifting to max distance. Panic,
            // low HP, or the hell-entry surge disengage automatically.
            // USER TACTIC: on the no-rainbow crown path, the win condition is
            // TIME, not boss kills — in hell the bot stalls with time stops
            // and consumable drops instead of seeking boss fights.
            // STALL MODE used to refuse boss engagement outright in hell —
            // "survival time is the score, don't seek boss fights". But with
            // SOUTH SIDE as the damage engine (user), the bot must actually
            // stand where its flame rain LANDS on the boss. Owning the zoner
            // re-enables engagement; without it, the old stand-off holds.
            const stallMode = rainbowChoice === 'skip' && hellDetected && !zoner;
            // The hell-entry window used to suppress engagement for its full
            // 90s — but that is exactly when the first hell bosses arrive.
            // A healthy bot with SOUTH SIDE up may engage through it (user:
            // the burn has to land on the boss); a hurt one still hangs back.
            const entryBlock = hellRecent && !(zoner && hpRatio > 0.7);
            if (!hpPanic && !entryBlock && hpRatio > 0.5 && !th.rival && !rainbowRecent && !stallMode) {
                for (const e of th.enemies) {
                    if (!e.boss || e.wall) continue;
                    if (wallFocus) continue;   // NO BOOKING first (user priority)
                    // a boss FASTER than us cannot be ringed — once it closes,
                    // backing out of contact is physically impossible (the
                    // four-hour two-top death pattern). Kite it instead —
                    // UNLESS the SUPER VODKA CRANBERRY knockback whip is up:
                    // it shoves bosses back off the ring (user-verified).
                    if (e.chaserFast && !knocker && !(rainbowThisRun && !rainbowRecent)) continue;   // gun era (demo-tuned): the rainbow melts chargers before contact
                    if (e.freezeAura && !knocker && !(rainbowThisRun && !rainbowRecent)) continue;   // two-top: NEVER ring inside a freeze aura — snipe it remotely
                    if (e.linebacker) continue;   // a charging linebacker is NEVER ringable — kite + homing kill it
                    // USER: MOJITO snipes bosses AT RANGE — with it leveled and
                    // passouts available, the bot's body stays on the passout
                    // farm and lets the sniper handle the boss remotely.
                    if ((ownedLevels['MOJITO'] || 0) >= 3 && th.passouts.some(po => !po.contested)) continue;
                    // the firing ring must sit OUTSIDE the boss's contact
                    // buffer — bosses hurt on touch (user-verified, all of them)
                    // v6.85.2: `bossFloor` is a per-character hard minimum on
                    // the firing ring in hell. Pat's 19-minute hell demo took
                    // damage at bossD 136 -> 93 (100->74) and 98 -> 74
                    // (100->46), and nothing at all above ~150. A small boss
                    // could previously be ringed at e.r+55 (~95px), straight
                    // inside that band. Gun-era point-blank melting is exempt:
                    // the rainbow kills before contact matters.
                    const bossFloor = (hellDetected && !(rainbowThisRun && !rainbowRecent))
                        ? (charOf().bossFloor || 0) : 0;
                    let ring = (rainbowThisRun && !rainbowRecent)
                        ? Math.max(e.r + 34, Math.round(e.reach * 0.55))   // DEMO-TUNED: gun-era point-blank boss melting (user p25: 60px)
                        : (CONFIG.rainbowPolicyOverride === 'skip'
                            // FULL-RUN CALIBRATION: the DAY phase sits far out
                            // (247 measured) where nothing can reach the bot.
                            // HELL (user): SOUTH SIDE must actually LAND on the
                            // boss — hold just outside its contact band so the
                            // flame rain covers the body, not empty floor.
                            ? (hellDetected
                                // early hell: get inside SOUTH SIDE's reach.
                                // late hell (giant bosses): their body covers
                                // the screen — stand off proportionally again.
                                ? (e.r > 90
                                    ? Math.max(e.r + 70, 200)
                                    : Math.max(e.r + 55, Math.min(e.reach + 10, 150)))
                                : Math.max(e.reach + 60, 240))
                            : Math.max(e.reach + 10, e.r + 40));
                    if (bossFloor && ring < bossFloor) ring = bossFloor;
                    bossRingRef.v = ring;
                    const errNow = Math.abs(Math.hypot(p.x - e.x, p.y - e.y) - ring);
                    const errNew = Math.abs(Math.hypot(nx - e.x, ny - e.y) - ring);
                    gain += M.bossEngageValue * dayFarm * (errNow - errNew) * 0.12;
                }
            }

            // Passout farming: walk INTO weapon range of passed-out customers
            // (they drop gold + XP), but don't wedge into their hitbox. Greed
            // is muted while panicking or during the hell-entry window.
            if (th.passouts.length && !hpPanic && !th.rival && !rainbowRecent) {
                // USER KILL ORDER: the frailest passout (lowest max HP) dies
                // first — fastest loot per second — and among peers, the one
                // that FELL FIRST (lowest id) before it despawns.
                let frailHp = Infinity, firstId = Infinity;
                for (const po of th.passouts) {
                    if (po.contested) continue;
                    if (po.maxHp < frailHp) frailHp = po.maxHp;
                    if (po.id < firstId) firstId = po.id;
                }
                // Corpse Reviver zombies CANNOT hit passouts (user-verified):
                // with CR as the only cocktail, farming them is slow
                // base-attack work — cut the detour incentive.
                for (const po of th.passouts) {
                    if (po.contested) continue;   // surrounded by live enemies: not worth the dive
                    if (wallFocus) continue;      // NO BOOKING first (user priority)
                    // SOURCE-VERIFIED: the game's contact-damage loop has NO
                    // passout exemption — touching a passout hurts exactly
                    // like touching a live enemy (invuln 38 frames between
                    // ticks). Farm from a FIRING RING outside the hitbox —
                    // weapons still hit it — never from on top of it.
                    // live audit: fallen passouts are BIG (r*1.9 in source —
                    // observed r 37) and hit 1.5x — the zone must clear the
                    // real contact edge (r + player radius) with margin
                    // FULL-RUN CALIBRATION (34-min manual MINGUK run): the
                    // farming distance TIGHTENS as the build matures — ~126px
                    // early, 95 mid, 86 late day — then widens post-finale
                    // (~137) where density explodes. Ring follows that curve.
                    const phR = gamePhase();
                    const gtRing = typeof G.gameTime === 'number' ? G.gameTime : 0;
                    // HELL RAMP (demo-measured): 128px at entry widening to
                    // ~245 by minute 30 as everything scales. Day keeps the
                    // tight, build-confidence curve.
                    const hellRing = 115 + Math.min(120, Math.max(0, (gtRing - 1200) / 600 * 120));
                    // v6.85.2: per-character day curve. Pat's manual demo farms
                    // from 130px in the opening minutes then tightens hard to
                    // ~72 and ~62 as the build matures — measured off stationary
                    // poD samples, keyed on gameTime rather than gamePhase()
                    // because the tightening happens at ~180s, well inside the
                    // 'early' bucket. Characters without a dayRing keep the
                    // original minguk-calibrated 118/112/105.
                    const dr = charOf().dayRing;
                    const dayRing = dr
                        ? (gtRing < 180 ? dr.early : (gtRing < 600 ? dr.mid : dr.late))
                        // DAY (minguk-calibrated): hold ~124px — weapons reach,
                        // falls and contact do not. Tight day rings were the
                        // 7-12 minute contact deaths.
                        : (phR === 'early' ? 118 : phR === 'mid' ? 112 : 105);
                    const ring = po.r + ((hellDetected || gtRing > 1200) ? hellRing * slowPad
                        : dayRing * slowPad);
                    const zone = po.r + 18;
                    const dNow = Math.hypot(p.x - po.x, p.y - po.y);
                    const d1 = Math.hypot(nx - po.x, ny - po.y);
                    if (dNow < zone) {
                        // TOUCHING it (taking contact ticks): retreat gradient
                        // only — no farm attraction until we're off the body
                        danger += 55 * (1 - Math.min(1, d1 / (zone + 30)));
                    } else {
                        gain += M.passoutValue * (crOnly ? 0.4 : 1) *
                            (Math.abs(dNow - ring) - Math.abs(d1 - ring)) * 0.15;
                        // never enter the contact zone, never cut through the
                        // body to reach the far side of the firing ring
                        if (d1 < zone || distPointSeg(po.x, po.y, p.x, p.y, nx, ny) < zone) danger += 60;
                    }
                }
            }

            // standoff: hold a productive distance from the crowd so weapons
            // keep firing (widened automatically when the wave is swarm-heavy)
            if (th.enemies.length && !panic) {
                const errNow = Math.abs(Math.hypot(p.x - cx, p.y - cy) - standoffAdj);
                const errNew = Math.abs(Math.hypot(nx - cx, ny - cy) - standoffAdj);
                gain += M.standoffPull * (errNow - errNew) * 0.28 * (anchor ? 0.4 : 1);   // anchored: the ring wins
            }

            // TIME-STOP STACKING — DEMO-CORRECTED (81-min manual stall run:
            // paused-boss distance p10 140 / med 254; the body is NEVER
            // hugged). Hold a SOUTH SIDE firing station ~150px out: the
            // flame rain and CAMPARI shred still land, but the wake-up burst
            // can't reach. Pull toward the station from either side.
            if (stopBoss) {
                const station = Math.max(150, (stopBoss.r || 40) + 90);
                const eNowS = Math.abs(Math.hypot(p.x - stopBoss.x, p.y - stopBoss.y) - station);
                const eNewS = Math.abs(Math.hypot(nx - stopBoss.x, ny - stopBoss.y) - station);
                gain += 26 * (eNowS - eNewS) * 0.2;
            }

            // ult centering: with 2+ passouts, drift onto their centroid so
            // the outward spiral catches the whole group
            if (anchor && poN >= 2) {
                const eNow = Math.hypot(p.x - poCx, p.y - poCy);
                const eNew = Math.hypot(nx - poCx, ny - poCy);
                gain += 14 * (eNow - eNew) * 0.15;
            }

            // kiting sweep + gap escape
            if (kite && i !== N) gain += (dx * kite.x + dy * kite.y) * M.kitePull * charOf().kiteMul * (zoner ? 1.6 : 1) * (knocker && th.boss ? 1.25 : 1) * (rainbowRecent ? 1.4 : 1) * (anchor ? 0.35 : 1) * (flight ? 1.8 : 1);
            if (escape && i !== N) gain += (dx * escape.x + dy * escape.y) * M.escapePull * (flight ? 1.8 : 1);

            // pull toward the middle of the arena — corners are death traps,
            // and a mob rush must bend the path INWARD, never into a corner
            const dcNow = Math.hypot(p.x - fw / 2, p.y - fh / 2);
            const dcNew = Math.hypot(nx - fw / 2, ny - fh / 2);
            gain += (dcNow - dcNew) * (0.06 + 0.07 * Math.min(1, th.near / 8));

            if (i !== N) gain += (dx * lastDir.x + dy * lastDir.y) * 1.4;  // momentum, prevents jitter
            else gain -= (zoner ? 2.4 : 1.0);                              // standing still is rarely right (and wastes burn zones)

            const value = gain - danger;
            if (!best || value > best.value) best = { dx, dy, value, danger, gain };
        }

        if (!best) return null;

        // Smooth in UN-normalised space. Normalising the blend would create a
        // fixed point: a reversal that cancels to a tiny residual would be
        // re-inflated to full strength in the old direction and never flip.
        const s = M.smoothing;
        smoothVec = {
            x: smoothVec.x * s + best.dx * (1 - s),
            y: smoothVec.y * s + best.dy * (1 - s)
        };
        const mag = Math.hypot(smoothVec.x, smoothVec.y);
        let vx, vy;
        if (mag > 0.02) { vx = smoothVec.x / mag; vy = smoothVec.y / mag; }
        else { vx = best.dx; vy = best.dy; }   // mid-reversal: commit to the new heading
        lastDir = { x: vx, y: vy };

        return {
            dx: vx, dy: vy,
            danger: best.danger, gain: best.gain, hpRatio, panic, hpPanic, slowMul,
            pauseActive, contactImminent, flight, depth: +depth.toFixed(2),
            blastImminent: th.marks.some(m => typeof m.tLeft === 'number' && m.tLeft <= 0.45 &&
                Math.hypot(m.x - p.x, m.y - p.y) < m.r),
            surge: surgeActive, hellRecent, rainbowRecent, projImminent, laneUrgent, rivalUrgent, frozenUrgent, sprinterUrgent, stacking: !!stopBoss, chase: !!th.rival, zoner, knocker, anchor, kiting: !!kite, flame: flameOn, hunger: +buildHunger.toFixed(2),
            toughness: +toughnessAvg.toFixed(2),
            passoutsNear: th.passouts.filter(po => Math.hypot(po.x - p.x, po.y - p.y) < 190).length,
            poCentroidDist: poN ? Math.round(Math.hypot(p.x - poCx, p.y - poCy)) : null,
            wallNear: th.enemies.some(e => e.wall && Math.hypot(e.x - p.x, e.y - p.y) < 190),
            bossNear: th.enemies.some(e => e.boss && !e.wall && Math.hypot(e.x - p.x, e.y - p.y) < 240),
            roamingBoss: th.enemies.some(e => e.boss && !e.wall && !e.stationary && Math.hypot(e.x - p.x, e.y - p.y) < 260),
            enemies: th.enemies.length, near: th.near, boss: th.boss,
            projectiles: th.projectiles.length, marks: th.marks.length,
            lines: th.lines.length, loot: loot.length,
            diag: `hp ${(hpRatio * 100).toFixed(0)}% | ${th.enemies.length}e ${th.projectiles.length}p ${th.marks.length}m ${loot.length}L | danger ${best.danger.toFixed(1)} | ${th.rival ? 'CHASE! ' : ''}${panic ? 'PANIC' : 'normal'}${depth > 0 ? ' | deep ' + Math.round(depth * 100) + '%' : ''}`
        };
    }

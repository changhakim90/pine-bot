
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
        nearestBossRef.v = Infinity;
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
                    // v6.85.10 (user: "there's too many passouts" / "it needs
                    // to clear ... passouts in day"). This used to cut off at
                    // lootRange*1.3 = 312px. On a 540x540 field that is a
                    // LOCAL window: parked in a corner, the bot could not see
                    // most of the floor, so a backlog on the far side was
                    // invisible and it never travelled to clear it — it just
                    // re-farmed whatever was next to it while the pile grew.
                    // The whole field is gathered now; `far` marks the ones
                    // outside the old window so the planner can treat them as
                    // a travel target rather than a station.
                    {
                        const dpo0 = Math.hypot(e.x - p.x, e.y - p.y);
                        out.passouts.push({
                            x: e.x, y: e.y, r: (typeof e.r === 'number' ? e.r : 12),
                            hp: typeof e.hp === 'number' ? e.hp : 40,
                            maxHp: typeof e.maxHp === 'number' ? e.maxHp : (typeof e.hp === 'number' ? e.hp : 40),
                            id: typeof e.id === 'number' ? e.id : 0,  // lower id = fell first
                            far: dpo0 >= CONFIG.movement.lootRange * 1.3
                        });
                    }
                    continue;
                }
                const dRaw = Math.hypot(e.x - p.x, e.y - p.y);
                // v6.85.12 INSTRUMENT — boss damage ring (user: "the bosses
                // have two blue rings, the inner ring is where the bosses get
                // damaged"). Rather than guess that radius and ship a seventh
                // unmeasured constant, measure it: every time a boss's HP
                // actually drops, record how far away the bot was standing.
                // The upper percentile of those distances IS the outer edge of
                // the ring where our damage lands. Runs BEFORE the enemyRange
                // cut so a boss engaged at the 240px day station is still seen.
                // WeakMap keyed on the entity object — enemies persist frame to
                // frame, and it cannot leak once the game drops them.
                if (t0 === 'boss' && typeof e.hp === 'number' && !/nobook/i.test(bc0 + ' ' + t0)) {
                    if (dRaw < nearestBossRef.v) nearestBossRef.v = dRaw;
                    const prevHp = bossHpMem.get(e);
                    bossHpMem.set(e, e.hp);
                    if (prevHp != null && e.hp < prevHp - 0.5) {
                        bossHitD.push(Math.round(dRaw));
                        if (bossHitD.length > 600) bossHitD.shift();
                    }
                }
                const d = dRaw;
                // v6.85.18 (user: "if a boss goes beyond the boundaries of
                // the canvas, the bot can still attack by going as close to
                // the corners and edges"). The 200px gather cut made an
                // off-canvas boss INVISIBLE: no engagement pull, so the bot
                // wandered instead of hugging the nearest edge point where
                // its weapons still reach the body. DAY-ONLY extension:
                // non-wall bosses are gathered out to 480px, tagged
                // `distant`, and participate ONLY in the firing-ring pull —
                // the ring-error minimisation over edge-clamped candidates
                // naturally parks the bot at the closest reachable point.
                // Distant bosses are excluded from the danger field, the
                // crowd counts and contactImminent, so nothing else changes;
                // hell is excluded entirely (deep-hell giants overlapping
                // the field from off-canvas must keep their old invisibility
                // — engaging them would send the bot corner-chasing).
                // v6.85.19: hell small bosses (r <= 90) join the extension —
                // only the giants keep the exclusion (corner-chasing risk).
                // v6.85.19 (user: "not attacking the inner ring even if time
                // stop is applied"): a FROZEN boss of ANY size also joins.
                // The corner-chasing danger that justifies excluding live
                // giants does not exist while the field is stopped — and the
                // stacking target selection can only pick bosses the gather
                // kept, so a stopped giant beyond 200px (or off-canvas) was
                // invisible at exactly the moment SOUTH SIDE should be
                // stacking on its hit circle.
                const frEarly = safe(() => frame, null);
                const frozenNow = frEarly != null &&
                    ((typeof e.frozenUntil === 'number' && e.frozenUntil > frEarly) ||
                     (typeof p.timeStopUntil === 'number' && p.timeStopUntil > frEarly));
                const distantBoss = d > R && t0 === 'boss' && d < 480 &&
                    (!hellDetected || (typeof e.r === 'number' && e.r <= 90) || frozenNow) &&
                    !(e.wall === true || /nobook/i.test(bc0 + ' ' + t0));
                if (d > R && !distantBoss) continue;
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
                // v6.85.15 (user: "the bot is still not registering the two
                // blue rings ... when they are frozen from time stop").
                // SOURCE-VERIFIED: a TIME STOP item does NOT set e.frozenUntil
                // on anyone — the game's enemy loop just does
                // `if (frame < player.timeStopUntil) continue;`. Only WHISKY
                // SOUR sets per-enemy frozenUntil. So every frozen-boss
                // mechanism in this bot (stopBoss, pauseActive, the 6.85.11
                // burn station) keyed on a flag the item never sets, and the
                // stacking window has only ever opened on WS freezes. The
                // global stop now counts as frozen for every enemy, with its
                // remaining frames feeding frozenLeft so the burn/safe
                // two-phase station and the <45-frame drop-out work unchanged.
                const tsLeftE = (fr != null && typeof p.timeStopUntil === 'number' && p.timeStopUntil > fr)
                    ? (p.timeStopUntil - fr) : 0;
                const wsFroz = typeof e.frozenUntil === 'number' && fr != null && e.frozenUntil > fr;
                const frozen = wsFroz || tsLeftE > 0;
                const frozenLeft = Math.max(wsFroz ? (e.frozenUntil - fr) : 0, tsLeftE);
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
                // v6.85.12 (user: "the bot is thinking the freeze aura of the
                // four-hour two-top to be its damage radius"). It was, and the
                // flag was also firing when no field existed: `!!e.partner` is
                // true for the whole run, but the field only forms while the
                // partners are actually close. So a two-top with its partner
                // across the map was carrying a phantom aura, was never
                // engaged, and pushed the bot 130px further out than the boss
                // itself warranted. The flag now means "the field is up (or
                // about to be)" — the same test the midpoint mark uses.
                const pairDist = (t === 'boss' && e.partner && typeof e.partner.x === 'number')
                    ? Math.hypot(e.x - e.partner.x, e.y - e.partner.y) : Infinity;
                const freezeAura = t === 'boss' && pairDist < GZ_PAIR_DIST * 2.2;
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
                    // v6.85.12: the `+130 freezeAura` term is GONE. `reach`
                    // drives a DAMAGE gradient (see the danger loop) and the
                    // boss firing ring. The pair field neither damages nor
                    // emanates from the boss body — it slows and freezes, from
                    // the pair's MIDPOINT — and the `pairFreeze` mark below
                    // already models it correctly, at the right centre, with
                    // the right radius, only while it exists. Adding it here
                    // double-counted the same field as body-centred damage and
                    // shoved the engagement ring 130px out for nothing.
                    reach: (prof.radius + (chaserFast && t === 'boss' ? 50 : 0)) * (slowPadRef.v || 1),   // fast bosses: fear from further out, scaled by how slowed we are
                    // v6.85.23: the 6.85.22 learned multiplier is NO LONGER
                    // APPLIED — it caused the worst regression of the project
                    // (n=273, median 843, supers 0.1, z=-3.1). The attribution
                    // assigned every hit, including mark/proj/DoT hits, to the
                    // NEAREST type, so the most common types ratcheted to the
                    // 2.2 cap within ~10 runs and persisted in the learn
                    // store: the bot feared ordinary mobs at 2.2x and stopped
                    // farming. Attribution keeps recording (instrument only,
                    // pineBot.enemyThreat()); applying it again requires
                    // sole-candidate attribution, not nearest-type.
                    w: prof.weight * armorEase,
                    wall: isWall, boss: t === 'boss', stationary: isStationary, chaserFast, freezeAura,
                    frozen, frozenLeft, distant: distantBoss, t: t0,
                    // v6.85.19: centre beyond the field bounds — most of the
                    // hit circle is unreachable, so any standoff ring must
                    // collapse to the sliver of body that pokes on-canvas.
                    offCanvas: (() => { const fw2 = safe(() => W, 540) || 540, fh2 = safe(() => H, 540) || 540;
                        return e.x < 0 || e.x > fw2 || e.y < 0 || e.y > fh2; })()
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
                if (t === 'boss' && !distantBoss) { out.boss = true; out.mix.boss++; }
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
            // v6.88.0 AUDIT D4. This built a Set from `l.owner`, but the
            // source-verified roadLine shape (see lineCost below) is
            // {x, y, ang, armed, dmg} — there is no owner field. The Set was
            // therefore always empty, `e.linebacker` was never assigned
            // anywhere in the codebase, and the `if (e.linebacker) continue`
            // guard in the boss-engagement block was dead: the bot parked at
            // its firing ring on a charging Last Call Linebacker, which is the
            // death the rule was written to prevent. The owner cannot be
            // identified from the real shape, so flag on ARMED lanes being
            // present at all — during a charge telegraph, no boss is ringable.
            const armedLanes = (G.roadLines || []).some(l => l && (l.armed || l.armed === undefined));
            if (armedLanes) for (const e of out.enemies) {
                if (e.boss && !e.wall) e.linebacker = true;
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
        // v6.85.10 (user: "there's too many passouts", screenshot at 17:59
        // with ~20 uncleared passouts on the floor and 21 live bodies). The
        // threshold was an ABSOLUTE count, so it is density-blind: at late-day
        // crowding almost every passout has 3 bodies within 85px, every one
        // trips `contested`, and the farm shuts off exactly when the floor is
        // thickest with loot. The 2 -> 3 bump in an earlier version was the
        // same bug being papered over one notch at a time. "Contested" has to
        // mean *busier than the field already is*, so the bar now rises with
        // the live body count: ~3 on an empty floor, ~7 at 21 bodies.
        const fieldBodies = out.enemies.reduce((n, e) => n + (e.wall ? 0 : 1), 0);
        const contestTol = Math.max(3, Math.round(3 + fieldBodies / 6));
        out.contestTol = contestTol;
        for (const po of out.passouts) po.contested = chasersNear(po.x, po.y, 85) >= contestTol;
        poFreeRef.v = out.passouts.reduce((n, po) => n + ((po.contested || po.far) ? 0 : 1), 0);
        for (const e of out.enemies) if (e.wall) e.contested = chasersNear(e.x, e.y, 100) >= contestTol;

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
                    // v6.85.9 (user): passouts are what the cross is FOR — the
                    // rest of the roster barely scratches them. A cross on the
                    // floor with a passout field up is close to top-priority
                    // loot, not a mild preference. On an empty field it stays
                    // cheap, so the bot leaves it lying there until it pays.
                    if ((lastPlan.passoutsNear || 0) >= 1) v += day ? 55 : 35;
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
                // v6.85.16 (user: "pick up tip rewards from killing bosses
                // faster to upgrade faster — even if boss is on the field in
                // day"). A tip drops where a boss died, which is usually next
                // to the OTHER bosses — inside the fear gradient, where lootMul
                // and the danger field starve its pull until the area clears
                // and the run's compounding window is gone. During the day at
                // healthy HP a tip is VITAL-grade: full pull, immune to the
                // greed discounts and the burn-window yield, worth one contact
                // tick exactly like a heal is.
                const gtTip = typeof G.gameTime === 'number' ? G.gameTime : 0;
                if (kind === 'tip' && !hellDetected && gtTip < 1200 && hpRatio > 0.45) vital = true;
                // v6.87.5 SOURCE-READ: openRecipe() spells out the evolution
                // rule — "base attack MAX + cocktail Lv6 + key ingredient MAX
                // -> evolve AT A BOSS TIP". The tip is not merely where the
                // upgrade is offered; it is the TRIGGER. So a tip on the floor
                // with an evolution already qualified is worth more than any
                // other loot in the game: it is a super cocktail lying there.
                if (kind === 'tip' && evolutionPending()) { v += 60; vital = true; }
            } else if (kind === 'coin' || kind === 'bill') {
                // Gold buys weapon upgrades — when we're losing the damage
                // race, gold IS damage. Scale it up with the deficit.
                v += Math.round(8 * dpsDeficit);
            }
            // v6.85.16 FILLER vs PAYOFF (user: "it seems to treat the feed
            // filler mark rewards as the same loot reward as the passouts").
            // Passouts drop bill/tip (source-verified); the ordinary mob feed
            // scatters coins. Per-item the table ranks them correctly, but the
            // loot pull is summed over the floor — a CARPET of filler coins
            // out-pulls the two bills a passout station will produce, and the
            // bot leaves the station to vacuum the feed. While a free passout
            // is up, filler (coins and unknown junk kinds) is halved: it is
            // not deleted — the magnet and the walk between stations still
            // collect it — it just can no longer outbid the payoff loot.
            const filler = kind === 'coin' || !(kind in PICKUP_VALUE);
            if (filler && !vital && poFreeRef.v >= 1) v = Math.round(v * 0.5);
            // And during a flame window the station IS the payoff — a loot
            // detour that breaks the burn costs more than any pickup is
            // worth. Everything non-vital yields while the cross burns.
            const flameNow = typeof p.fireCrossUntil === 'number' &&
                p.fireCrossUntil > (safe(() => gameTime, 0) || 0);   // v6.86.7: seconds, not frames
            if (flameNow && !vital && kind !== 'timestop') v = Math.round(v * 0.45);
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
        let poTtkOut = null, poDpsOut = 0;   // v6.86.2 reporting (set by the station block)

        const maxHp = p.maxHp || p.maxHealth || p.hpMax || 100;
        const rawHp = p.hp != null ? p.hp : (p.health != null ? p.health : maxHp);
        // v6.89.1 THE SHIELD IS PART OF THE POOL, AND THE BOT COULD NOT SEE IT.
        // Live probe at gt 2698: hp 287.976, maxHp 287.976 — EXACTLY full — with
        // shield 125.2 of shieldMax 135 and `shieldFlash` equal to the current
        // frame. It was being hit at that instant and reporting itself
        // untouched. `p.shield` was read NOWHERE in this codebase.
        //
        // Two consequences, both bad, and together they are the best
        // explanation on record for "the run was fine and then it died":
        //   1. Every caution gate below — hpPanic, the anchor's hpRatio > 0.7,
        //      the panic multipliers — ran the boldest posture while a third of
        //      the effective pool was being stripped, then met the real HP bar
        //      already at the cliff edge with no accumulated caution.
        //   2. `hp` is what the damage telemetry samples, so EVERY absorbed hit
        //      was invisible to dangerAccum, to the death-cause verdict, and to
        //      the learned per-type threat multipliers. The bot was not
        //      under-reacting to that damage; it never knew it happened.
        // Folding the shield in fixes both at once — the ratio and the sampler
        // are the same number.
        const shield = (typeof p.shield === 'number' && p.shield > 0) ? p.shield : 0;
        const shieldMax = (typeof p.shieldMax === 'number' && p.shieldMax > 0) ? p.shieldMax : 0;
        const hp = rawHp + shield;
        const hpRatio = Math.max(0, Math.min(1, hp / ((maxHp + shieldMax) || 1)));

        // FLAME CROSS — v6.86.7 UNIT FIX. The bot compared this deadline
        // against `frame`, but the game sets it in SECONDS:
        //     player.fireCrossUntil = gameTime + (5 + fireCrossBonus)
        //     if (player.fireCrossUntil && gameTime < player.fireCrossUntil)
        // Live sample: fireCrossUntil 7968.9, gameTime 8054.4, frame 635073 —
        // so `fireCrossUntil > frame` was ALWAYS false and every flame
        // behaviour in this file has been dead code since it was written.
        // (timeStopUntil and frozenUntil ARE frame-based — checked against the
        // same sample — so those comparisons stay as they are.)
        const frameNow = safe(() => frame, 0) || 0;
        const gtFlame = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const flameOn = typeof p.fireCrossUntil === 'number' && p.fireCrossUntil > gtFlame;

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

        // GUARDED LOOT — v6.86.1 CORRECTED. The old rule muted a loot pull to
        // 15% when a passout stood on the path, on the stated premise that
        // "the game's contact-damage loop has NO passout exemption". The live
        // source says the opposite:
        //     if(e.type!=='passout' && !isInvuln() && dist < e.r+player.r)
        //     // 접촉 데미지 (passout=만취 손님은 장애물이라 데미지 없음)
        // A passout is a pure OBSTACLE: it blocks and pushes the player out,
        // and never deals damage. Only the falling drop-mark hurts, and marks
        // are modelled separately. So the path costs a detour, not blood.
        for (const it of loot) {
            if (it.vital) continue;
            for (const po of th.passouts) {
                if (distPointSeg(po.x, po.y, p.x, p.y, it.x, it.y) < po.r + 18) { it.v *= 0.85; break; }
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
        // v6.86.1 ULT INVULNERABILITY WINDOW. Both non-nuke ultimates grant
        // real invulnerability while they run — pat's spiral for its whole
        // (1.4+0.13*lv)*1.3 s, joe's Untouchable for 8+0.8*(lv-1) s — and the
        // game's contact loop is gated on `!isInvuln()`. Nothing can hurt us
        // in that window, so caution is wasted there, and for joe RETREATING
        // wastes the ult outright: the spikes only reach player.r + ~149.
        // v6.89.9 MINGUK IS INVULNERABLE DURING THE CLASE AZUL DROP, and this
        // bot could not see it. Read whole from source:
        //
        //   function isInvuln(){ return player.invuln>0 ||
        //     gameTime < (player.ultUntil||0) ||
        //     gameTime < (player.ultSpiralUntil||0) || !!claseUlt; }
        //
        // The last clause is the one that was missed. `useUltimate` for minguk
        // sets `claseUlt = { t:0, drop:max(60, round(dropSec*60)), ... }` — a
        // bare module-scope object, not a timestamp on `player` — and the
        // contact loop's gate returns true for as long as it EXISTS. dropSec
        // comes from the bomb-drop sound (2.3 s fallback), so the window is
        // ~2.3 s of drop plus the white-flash phase: comparable to pat's 2.834 s
        // and utterly unlike the "no invulnerability at all" this project has
        // assumed for minguk since 6.86.1. The user called it: "minguk's
        // ultimate does have an invincibility frame, the game just doesn't seem
        // to label it correctly."
        //
        // The cost of missing it was not cosmetic. `ultInvuln` feeds three
        // gates directly:
        //     caution  = ... * (ultInvuln ? 0.35 : 1)
        //     hpPanic  = !ultInvuln && hpRatio < ...
        //     flight   = ... && !ultInvuln
        // so for minguk the bot played its most frightened posture — panicking,
        // fleeing, and (before 6.89.8) dashing — through the single safest
        // 2.3 seconds of the entire run, every single time.
        // v6.89.10 INVULNERABILITY IS NOT A LICENCE TO OVER-COMMIT. 6.89.9 gave
        // minguk his real `claseUlt` window and `dayClearRate` promptly fell
        // from ~0.80 (n=65 and n=37 rows) to 0.41 at n=22, with runs ending at
        // 163-475 s. A live probe ruled out the obvious cause — `claseUlt` was
        // null 44 s after a cast, so the flag is not sticking.
        //
        // What is left is the shape of the relaxation. `ultInvuln` switched off
        // `hpPanic` and `flight` outright, and those are the two mechanisms that
        // get the bot OUT of a crowd. Through a 2.3 s window the bot therefore
        // walks in, and when the window closes it is standing in the middle of
        // the field with no escape underway. In the day, before OLIVE reaches
        // the 4 levels that floor contact damage, that is fatal in about four
        // seconds.
        //
        // Note this was never minguk-specific: pat's 2.83 s spiral had exactly
        // the same problem. 6.89.9 did not introduce the behaviour, it extended
        // it to the character actually being run, which is what made it visible.
        //
        // So: any invulnerability still relaxes CAUTION — nothing can hurt us,
        // and playing scared inside the window wastes it. But only a window with
        // room left to disengage may switch off panic and flight. Joe's 12 s
        // qualifies for almost its whole duration; pat's and minguk's ~2.3-2.8 s
        // qualify only at the start, which is exactly when committing is safe.
        const gtInv = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const claseNow = safe(() => claseUlt, null);
        let ultInvulnLeft = 0;
        const uuInv = safe(() => player.ultUntil, 0), usInv = safe(() => player.ultSpiralUntil, 0);
        if (uuInv > gtInv) ultInvulnLeft = Math.max(ultInvulnLeft, uuInv - gtInv);
        if (usInv > gtInv) ultInvulnLeft = Math.max(ultInvulnLeft, usInv - gtInv);
        if (claseNow) {
            // claseUlt carries frames, not a timestamp: { t, drop, flashT }.
            // Past the drop it is in the white-flash phase, whose length we have
            // not read — assume little is left rather than much.
            const dropLeft = (typeof claseNow.drop === 'number' && typeof claseNow.t === 'number')
                ? Math.max(0, (claseNow.drop - claseNow.t) / 60) : 0.3;
            ultInvulnLeft = Math.max(ultInvulnLeft, dropLeft);
        }
        const ultInvuln = ultInvulnLeft > 0 || !!claseNow;
        const ultInvulnSafe = ultInvulnLeft >=
            (M.ultInvulnCommitS != null ? M.ultInvulnCommitS : 1.2);
        const auraUlt = ultInvuln && charOf().ultKind === 'aura';
        // v6.86.4: how close the ultimate is — the whole passout economy keys
        // off this (see CONFIG.movement.ultHarvestLeadS).
        const gtUlt = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const ultAtT = safe(() => player.ultReadyAt, null);
        const ultInS = typeof ultAtT === 'number' ? Math.max(0, ultAtT - gtUlt) : 999;
        const ultReadyNow = typeof ultAtT === 'number' ? gtUlt >= ultAtT : false;
        // v6.86.2: armour bought with OLIVE + NEGRONI levels is permission to
        // hold ground. Pat (tank) converts it 1.4x, which is what lets him
        // stand on a passout long enough for the flame cross or the ult to
        // land instead of sliding off the body every time a mob closes.
        const armorLv = (ownedLevels['OLIVE'] || 0) + (ownedLevels['NEGRONI'] || 0);
        const armorConf = Math.min(M.armorConfMax,
            armorLv * M.armorConfPer * (charOf().style === 'tank' ? 1.4 : 1));
        const caution = (1 - armorConf * (M.armorCautionShare || 0)) * (ultInvuln ? 0.35 : 1) *
            (1 + 0.4 * late + 0.3 * Math.min(1, Math.max(0, toughnessAvg - 1))) *
            (hellDetected ? M.hellCautionMul : 1) *
            (hellRecent ? 1.35 : 1) *
            (rainbowRecent ? 1.35 : 1) *
            (surgeActive ? 1.25 : 1) *
            (flameOn ? 0.85 : 1);   // v6.86.7: the burn is OFFENCE, not a shield — only a mild boldness

        // death-cause telemetry. LIVE-AUDIT FIX: pure exposure counting
        // misattributed deaths badly (standing NEAR a wide lane logged 'line'
        // every tick while actual damage came from elsewhere — 28/30 'line'
        // verdicts vs ZERO observed lane hits in a 4-minute ground-truth
        // audit). Exposure now counts at 0.25 weight; REAL hp drops are
        // classified against the hazards actually in range and weighted by
        // damage taken, so the death verdict follows the damage.
        for (const k in dangerAccum) dangerAccum[k] *= 0.96;
        // v6.89.1 CONTACT REACH — the hardcoded 6 was the audit's own bug.
        // Both this exposure test and the `cands` predicate below measured to
        // the player's CENTRE and compared against a literal 6, but the player
        // has a radius (live probe: p.r = 7.2) and the game collides
        // centre-to-centre against e.r + p.r. Every genuine contact hit landing
        // in the band between 6 and p.r therefore found NO candidate and was
        // booked as `unattributed` — 16% of all events and 16% of all HP lost
        // across 893 recorded runs, with `near` p25 0 / median 1 / p75 2 and
        // bosses a median 210px away. That profile is ordinary contact damage,
        // not a missing hazard class: the predicate was simply too tight.
        // (An aura system was suspected and ruled out — updateAuras iterates
        // player.weapons and kills enemies. It is the bot's OWN damage.)
        const contactReach = (typeof p.r === 'number' && p.r > 0) ? p.r : 7.2;
        for (const e of th.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + contactReach) { dangerAccum.contact += 0.25; break; }
        for (const q of th.projectiles) if (Math.hypot(q.x - p.x, q.y - p.y) < q.r * 2.5) { dangerAccum.proj += 0.25; break; }
        for (const m of th.marks) if (Math.hypot(m.x - p.x, m.y - p.y) < m.r) { dangerAccum.mark += 0.25; break; }
        for (const l of th.lines) if (lineCost(l, p.x, p.y)) { dangerAccum.line += 0.25; break; }
        if (lastHpSample != null && hp < lastHpSample - 0.5) {
            const loss = lastHpSample - hp;
            // v6.89.11 A MARK IS GONE BY THE TIME ITS DAMAGE IS SEEN.
            //
            // 145 runs of damageAudit showed 161-162 point losses sitting in
            // `sole.contact` — and 161.6 is exactly `maxHp * 0.40`, the `again`
            // drop-mark formula, on a 404 pool. The mark detonates, damage
            // applies, the game removes it from `dropMarks`, and the next plan
            // tick finds nothing there. Every one of those was booked as contact
            // because contact is the chain's default.
            //
            // That inflated `sole.contact` (38%) and deflated `sole.mark` (7%),
            // and is the likeliest explanation for `unattributed` at 24% with a
            // bossD median of 205 and a near median of 1 — a mark landed, and by
            // the time the loss was sampled there was nothing in range at all.
            //
            // Classify against the marks seen on the PREVIOUS tick as well as
            // this one. A mark that existed a tick ago and has vanished is the
            // single most likely author of a large loss.
            const markPool = lastMarkSnap.length ? th.marks.concat(lastMarkSnap) : th.marks;
            let cls = 'contact';
            if (th.rival && th.rival.d < 150) cls = 'rival';
            else if (th.lines.some(l => l.armed === true && lineCost(l, p.x, p.y) > 0.15)) cls = 'line';
            else if (th.projectiles.some(q => Math.hypot(q.x - p.x, q.y - p.y) < q.r + 22)) cls = 'proj';
            else if (markPool.some(m => Math.hypot(m.x - p.x, m.y - p.y) < m.r + 10)) cls = 'mark';
            dangerAccum[cls] = (dangerAccum[cls] || 0) + loss * 0.35;

            // v6.85.13 AUDIT — record the EVIDENCE, never a verdict. Same
            // predicates and thresholds as the chain above, but evaluated
            // independently instead of first-match-wins, so we can see how
            // often a class was the SOLE candidate (ground truth), how often
            // it merely co-occurred, and how often NOTHING was in range —
            // which the chain silently books as 'contact'.
            const nearestGap = (arr, f) => { let b = Infinity; for (const it of arr) { const v = f(it); if (v < b) b = v; } return b; };
            const gContact = nearestGap(th.enemies, e2 => Math.hypot(e2.x - p.x, e2.y - p.y) - e2.r);
            const gProj = nearestGap(th.projectiles, q => Math.hypot(q.x - p.x, q.y - p.y) - q.r);
            const gMark = nearestGap(markPool, m => Math.hypot(m.x - p.x, m.y - p.y) - m.r);
            const gBoss = nearestBossRef.v;   // field-wide, not capped at enemyRange
            const cands = [];
            if (th.rival && th.rival.d < 150) cands.push('rival');
            if (th.lines.some(l => l.armed === true && lineCost(l, p.x, p.y) > 0.15)) cands.push('line');
            if (gProj < 22) cands.push('proj');
            if (gMark < 10) cands.push('mark');
            if (gContact < contactReach) cands.push('contact');   // v6.89.1: was a literal 6 — see contactReach above
            dmgAudit.n++; dmgAudit.hp += loss;
            const bump = (tbl, k) => { const b = tbl[k] || (tbl[k] = { n: 0, hp: 0 }); b.n++; b.hp += loss; };
            if (!cands.length) {
                dmgAudit.none.n++; dmgAudit.none.hp += loss;
                if (isFinite(gBoss)) dmgAudit.none.bossD.push(Math.round(gBoss));
                dmgAudit.none.near.push(th.near);
                if (dmgAudit.none.bossD.length > 800) dmgAudit.none.bossD.shift();
                if (dmgAudit.none.near.length > 800) dmgAudit.none.near.shift();
            } else {
                for (const c of cands) bump(dmgAudit.cls, c);
                if (cands.length === 1) bump(dmgAudit.sole, cands[0]);
            }
            // v6.85.22: nearest gathered enemy type within 140px carries
            // the per-type attribution for the learned threat multiplier.
            let nearT = null, nearTD = 140;
            for (const e2 of th.enemies) {
                const dd2 = Math.hypot(e2.x - p.x, e2.y - p.y);
                if (dd2 < nearTD) { nearTD = dd2; nearT = e2.t || (e2.boss ? 'boss' : 'mob'); }
            }
            if (nearT) {
                hitTypeRun[nearT] = (hitTypeRun[nearT] || 0) + loss;
                const bt = dmgAudit.byType || (dmgAudit.byType = {});
                const b2 = bt[nearT] || (bt[nearT] = { n: 0, hp: 0 });
                b2.n++; b2.hp += loss;
            }
            dmgAudit.ev.push({
                gt: Math.round(typeof G.gameTime === 'number' ? G.gameTime : 0),
                hell: hellDetected ? 1 : 0, loss: Math.round(loss * 10) / 10,
                c: cands.join('+') || 'none', verdict: cls,
                bossD: isFinite(gBoss) ? Math.round(gBoss) : null, near: th.near
            });
            if (dmgAudit.ev.length > 300) dmgAudit.ev.shift();
        }
        lastHpSample = hp;
        // v6.89.11: remember this tick's marks so the NEXT tick can still blame
        // one that detonated and removed itself. Positions only — the objects
        // belong to the game and may be recycled.
        lastMarkSnap = th.marks.map(m => ({ x: m.x, y: m.y, r: m.r }));

        // v6.89.7 INCOME AUDIT. Both directions of the pool, integrated against
        // gameTime, bucketed by depth. `hp` here is the POOLED reading (raw HP
        // plus shield, since 6.89.1) because that is what actually absorbs a
        // contact tick — a NEGRONI shield regenerating IS heal income.
        //
        // Two guards matter. A gap over 5s means the tab was throttled or a
        // screen intervened, so the interval is dropped rather than smeared
        // across a bucket. And a single jump over 40% of the pool is not
        // income — it is a level-up maxHp raise or a COFFEE BEANS revive — so
        // those are counted separately instead of inflating the heal rate.
        try {
            const gtInc = typeof G.gameTime === 'number' ? G.gameTime : null;
            if (gtInc != null) {
                const key = Math.floor(gtInc / INC_BUCKET_S) * INC_BUCKET_S;
                const b = incAudit.buckets[key] ||
                    (incAudit.buckets[key] = { dtS: 0, lossHp: 0, gainHp: 0, lossN: 0, gainN: 0, spikeN: 0, spikeHp: 0 });
                const dt = incCursor.t == null ? 0 : gtInc - incCursor.t;
                if (dt > 0 && dt < 5) {
                    b.dtS += dt;
                    if (incCursor.hp != null) {
                        const d = hp - incCursor.hp;
                        const poolMax = (maxHp + shieldMax) || 1;
                        if (d > 0.5) {
                            if (d > poolMax * 0.4) { b.spikeN++; b.spikeHp += d; }
                            else { b.gainHp += d; b.gainN++; }
                        } else if (d < -0.5) { b.lossHp -= d; b.lossN++; }
                    }
                }
                incCursor.t = gtInc; incCursor.hp = hp;
            }
        } catch (e) { }

        // LATE-DAY FIX (user: passouts not cleared 15-20 min): 'panic' used
        // to trigger on CROWD COUNT alone, which is just the normal state of
        // a dense late-day field — it was turning all farming off exactly
        // when the loot matters most. hpPanic = actually hurt; panic (crowd
        // included) still governs movement caution and loot greed.
        // v6.85.0: a tank panics later (more HP to spend), a runner sooner
        // v6.86.1: nothing can damage us mid-ult, so panic (and the flight
        // it drives) is suspended for the window — it would spend joe's eight
        // invulnerable seconds running away from the only thing his spikes
        // can hit.
        // v6.86.12: armour buying a LATER panic is also tank evidence. On a
        // runner it delays the one reflex that keeps him alive, so the
        // softening now follows anchorBias with the rest of the tank posture.
        const panicArmor = charOf().anchorBias > 0 ? (1 - 0.5 * armorConf) : 1;
        const hpPanic = !ultInvulnSafe && hpRatio < M.panicHp * charOf().panicMul * panicArmor * (1 + 0.25 * late);
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
        // v6.89.4 BUILD COMPLETENESS damps the kite in hell (user). Anything
        // owned at any level counts — the point is whether the tools EXIST, not
        // whether they are maxed.
        let kiteBuiltN = 0;
        for (const nm of KITE_DAMP_BUILD) if ((ownedLevels[nm] || 0) > 0) kiteBuiltN++;
        const kiteBuildShare = KITE_DAMP_BUILD.length ? kiteBuiltN / KITE_DAMP_BUILD.length : 0;
        let kite = null;
        // v6.87.0: same bet, same per-character answer. Owning SOUTH SIDE (or
        // a fresh rainbow) still buys one chaser of impatience, because the
        // sweep is what drags the train across the burning ground.
        const kiteAt = Math.max(2, (charOf().kiteChasers || 3) - ((zoner || rainbowRecent) ? 1 : 0));
        // v6.89.5 (user): "in the last runs, kiting has resulted in constant
        // contact damage with the mobs in hell as they keep rushing, unlike day
        // mode."
        //
        // That is not a tuning complaint, it is a statement about when kiting is
        // a valid move at all. A tangential sweep only works if it OPENS A GAP:
        // the arc is longer than the pack's straight-line cut across it, so the
        // moment the pack matches your speed the sweep stops buying separation
        // and simply holds the bot inside contact range for the whole arc. This
        // file already knows when that is — `chaserFast` is set per enemy at
        // gather time as `speed >= playerSpeed * 0.85` — and the comment on the
        // standoff term already records that mobs pass the player's speed at
        // around eleven minutes. So in hell the condition is essentially always
        // true, and the bot has been paying the arc cost for nothing.
        //
        // Damping it (6.89.4) was the right direction but the wrong shape: a
        // weaker version of a move that cannot work is still a move that cannot
        // work. When the pack is not outrunnable the kite is OFF, and the corner
        // plus the burn is what the doctrine puts in its place.
        //
        // Day is untouched: day mobs are slower, the sweep does open a gap, and
        // dragging the conga line through burn zones is how the day phase pays.
        //
        // v6.89.6 corrects the SHAPE of that answer. 6.89.5 made the outrun
        // test a cliff: 1x on one side, 0x on the other. Both sides are wrong.
        // Below the threshold the bot kites at full weight even with a finished
        // build sitting in a corner; above it the bot will not take one step
        // away from a body that is one frame from touching it. The user's own
        // phrasing is not a weight at all, it is a THRESHOLD —
        //
        //   "just enough distance for no contact damage deaths"
        //
        // — so against a pack that cannot be outrun the kite stops being a
        // posture and becomes a spacing controller: silent until something is
        // inside (player radius + kiteBand), then a sidestep, then silent again.
        //
        // v6.89.7 FROZEN BODIES ARE NOT CHASING ANYTHING. The 6.89.5 ratio was
        // `fastChasers / chasers`, and those two counts disagreed about frozen
        // enemies: gather forces `spd = 0` on a frozen body, so it can never be
        // `chaserFast`, but `chasers` counted it anyway. A freeze therefore
        // DEFLATED the ratio and flipped `outrunnable` back to true — the exact
        // opposite of the truth, since the pack resumes at full speed the
        // instant the stop ends. A live console read caught it: `outrunnable:
        // true, kiting: true, kiteDamp: 0` under a time stop at 6000s.
        //
        // Under a FULL pause the damage was masked (kiteDamp is 0, so the gain
        // term vanished anyway). The real cost is a PARTIAL freeze — a stop
        // wearing off, or a WHISKY SOUR catching half the pack — where
        // `pauseActive` is false, kiteDamp is the ordinary build damp, and a
        // genuine sweep fires against a pack that is very much still rushing.
        // It also corrupted the panel's posture flag, which is the one thing
        // the user was asked to watch.
        //
        // Count only bodies that are actually moving, on BOTH sides. An
        // all-frozen field then has nothing to outrun, which reads as "the
        // sweep does not pay" rather than "we are faster than them" — the
        // deadband below still steps away from anything touching us.
        let liveChasers = 0, fastChasers = 0;
        for (const e of th.enemies) {
            if (e.wall || (e.boss && e.stationary)) continue;
            if (e.frozen) continue;
            liveChasers++;
            if (e.chaserFast) fastChasers++;
        }
        const outrunnable = !hellDetected || (liveChasers > 0 && (fastChasers / liveChasers) < 0.5);
        // Nearest centre-to-EDGE gap, the same measure the damage audit uses for
        // `gContact` — so the band is expressed in the units the contact deaths
        // were actually counted in.
        let contactGap = Infinity;
        for (const e of th.enemies) {
            if (e.wall) continue;
            const g = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
            if (g < contactGap) contactGap = g;
        }
        const kiteBand = (M.kiteBand != null ? M.kiteBand : 20);
        const inKiteBand = contactGap < contactReach + kiteBand;
        // Spacing mode is exactly "the kite ARMED even though the pack cannot be
        // outrun" — which by construction can only have happened via the band.
        // Set inside the gate, not beside it: a flag that reports the posture
        // the bot is not actually in is a flag that makes its own test toothless
        // (the first draft of kite-deadband proved exactly that).
        let kiteSpacing = false;
        if (chasers >= kiteAt && !panic && (outrunnable || inKiteBand)) {
            const rx = p.x - cx, ry = p.y - cy;
            const rm = Math.hypot(rx, ry) || 1;
            const t1 = { x: -ry / rm, y: rx / rm }, t2 = { x: ry / rm, y: -rx / rm };
            kite = (t1.x * lastDir.x + t1.y * lastDir.y) >= (t2.x * lastDir.x + t2.y * lastDir.y) ? t1 : t2;
            kiteSpacing = !outrunnable;
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
        // v6.89.4 KITE DAMPING (user), computed here because it reads the pause.
        // The day is untouched: the funding phase still wants the pack dragged
        // through burn zones, and a thin early build has nothing else to do.
        //
        //   "make kiting lower in hell mode if bot has [the build]"
        //   "kiting lower especially with time stop ... in hell mode"
        //   "just enough distance for no contact damage deaths — which should be
        //    rare with negroni's dodge and shield"
        //
        // Under a time stop the field is not moving. There is nothing to sweep
        // around and nothing chasing; the kite is pure wasted travel that walks
        // the bot off its own burn. That case is damped hardest.
        const kiteDampBuild = hellDetected
            ? 1 - (1 - (M.kiteDampFull != null ? M.kiteDampFull : 0.25)) * kiteBuildShare
            : 1;
        const kiteDamp = (hellDetected && pauseActive)
            ? kiteDampBuild * (M.kiteDampPaused != null ? M.kiteDampPaused : 0.15)
            : kiteDampBuild;

        // FLIGHT MODE: in hell, with no pause holding the field and the
        // bodies scaled past killable, fighting is not an option — run,
        // dash, and get to a time-stop pickup. Pause ends it.
        // v6.85.6 (user directive): "once mobs become unkillable the bot
        // should constantly dash away and run away while using ultimate."
        // `!hpPanic` switched flight OFF at low HP — exactly when running
        // matters most. The panic posture that replaced it does NOT open the
        // 300 ms dash gate (that keys on plan.flight), so the bot got less
        // mobile the closer it came to dying. The crowd gates are unchanged:
        // loosening them is not something the directive settles, and there is
        // no measurement behind 4-vs-3.
        // v6.88.0 AUDIT D3: `distant` is now READ. It was written onto every
        // gathered enemy and never read anywhere, so the exclusions its own
        // comment promises ("excluded from the danger field, the crowd counts
        // and contactImminent") did not exist. In hell with slowMul 0.5 a
        // distant boss at 210px still contributed danger ~5.4 — above the 4.8
        // dash threshold — so the bot dashed away from the boss the firing-ring
        // term was simultaneously paying it to approach.
        const unkillable = toughnessAvg > 25 || (killRate < 0.8 && th.near >= 6);
        // v6.87.0: the crowd that triggers flight is per character. Fleeing is
        // a speed bet, and pat cannot win it — at 1.9 he is slower than deep
        // hell's spawns from ~60m on, so flight for him is being chased down
        // with his back turned instead of eating the hits his armour and his
        // invulnerable ult window were bought for. He commits at 6; minguk,
        // whose doctrine IS outrunning, keeps the historical 4.
        const fleeNear = charOf().fleeNear || 4;
        const flight = hellDetected && !pauseActive && unkillable && th.near >= fleeNear && !ultInvulnSafe;
        flightRef.v = flight;
        // v6.85.20 (user): "the deep hell poison kill should be from the mobs
        // ... keep dashing away and ultimate until the bot can get timestop
        // from the mob through luck ... frequent killing of mobs with ultimate
        // and southside when boss is not present should help." Two flight
        // postures, not one. With a BOSS hunting us, flee at full pressure
        // (kite 1.8x). BOSSLESS flight is the GRIND: the pack chases through
        // our own SOUTH SIDE wake, the ult fires on cooldown, and mob kills
        // are the only source of the timestop that ends the chase — so the
        // kite pressure eases (1.25x) to keep the pack inside the burn wake
        // instead of outrunning our own kill loop. Audit context: ~18% of all
        // HP loss is an unmodelled DoT the user attributes to these mobs, so
        // pure distance was never buying what the planner thought it was.
        const grind = flight && zoner && !th.enemies.some(e => e.boss && !e.wall);

        // v6.85.2: falling-passout drops excluded — see the `drop` tag above.
        const markHere = th.marks.some(m => !m.drop && Math.hypot(m.x - p.x, m.y - p.y) < m.r + 50);
        // live enemy fire anywhere near us: do NOT plant — keep moving
        const projHere = th.projectiles.some(q =>
            Math.hypot(q.x - p.x, q.y - p.y) < q.r + 130);
        const dayPhaseNow = !hellDetected && (typeof G.gameTime === 'number' ? G.gameTime : 0) < 1200;
        // v6.85.0: a tank plants on a busier field than a runner would
        // v6.85.16 FLAME ANCHOR (user: "the pat bot is not anchoring to
        // fully utilize the flame cross to defeat the passouts"). The normal
        // anchor demands a quiet field (near <= 4 for Pat), OLIVE/NEGRONI >= 2
        // and no shot within 130px — a 10-minute field fails all three almost
        // permanently. Without anchor the kite pull runs at FULL strength and
        // drags the bot off the station, so the 6.85.9 collapsed flame ring
        // was being fought by kiting for the whole burn window: the cross
        // burned while the bot slid away from the passout. While the cross is
        // up with a free passout in reach, the burn IS the defense (`caution`
        // already scales 0.72x under flame) — anchor unconditionally on
        // everything except being hurt, the rival chase, and flight.
        const flameAnchor = flameOn && !hpPanic && !th.rival && !rainbowRecent && !flight &&
            th.passouts.some(po => !po.contested && !po.far && Math.hypot(po.x - p.x, po.y - p.y) < 260);
        // v6.86.2 (user: "he needs to be anchored to keep attacking the
        // holdouts"). A holdout — a passout or wall we are standing on — only
        // dies to sustained fire, and sliding off it every time a mob closes
        // is why they never finished. With armour bought (OLIVE/NEGRONI) the
        // tank has the licence to plant. Hugging distance, not the old
        // 220px "nearby", is what counts here.
        // v6.86.12 (user: "why has minguk regressed so much? it can't pass
        // the day time... or dies very early"). The anchor was derived ENTIRELY
        // from Pat demos — a 180 HP tank with anchorBias 1 and crowdPanic off —
        // but its only gate was armorConf, which is read off OLIVE/NEGRONI
        // levels. Minguk's own doctrine rushes exactly those, so a 120 HP
        // runner with anchorBias 0 and crowdPanic ON inherited a tank's licence
        // to plant next to holdouts. Evidence gathered on one character should
        // apply to that character: the anchor now requires anchorBias.
        const holdoutAnchor = charOf().anchorBias > 0 &&
            !hpPanic && !markHere && !th.rival && !flight && armorConf > 0.05 &&
            th.passouts.some(po => !po.contested && !po.far &&
                (Math.hypot(po.x - p.x, po.y - p.y) - po.r) < M.poEngageRange * 0.5);
        const anchor = flameAnchor || holdoutAnchor || (!hpPanic && hpRatio > 0.7 && !markHere && !projHere && !th.rival && !rainbowRecent && !flight &&
            (!dayPhaseNow || th.near <= 2 + charOf().anchorBias * 2) &&   // day: only anchor on a quiet field (manual run: crowd median 0)
            ((ownedLevels['OLIVE'] || 0) >= 2 || (ownedLevels['NEGRONI'] || 0) >= 2) &&
            (wallFocus || th.passouts.some(po => !po.contested && Math.hypot(po.x - p.x, po.y - p.y) < 220)));
        // v6.88.2 CORNER ANCHOR — deliberate user strategy in deep hell, and
        // the source says why it works. Boss drop-marks spawn UNIFORMLY at
        // random inside [52, W-52] x [62, H-62] and are never aimed at the
        // player; their damage is player.maxHp*0.40 ('again') / *0.35
        // ('selfie'), so being a PERCENTAGE of max HP no amount of HP, armour
        // or regen defends against them — only standing somewhere they cannot
        // spawn does. At the true arena corner the nearest possible mark CENTRE
        // is 80.9 px away against a ~70 px reach: geometrically immune, versus
        // ~8.5% per mark in open field. Marks are 21-31% of all deaths.
        // Danger terms (marks, lanes, contact) still outrank this pull, so the
        // bot leaves the corner when something is actually landing on it.
        const gtCorner = typeof G.gameTime === 'number' ? G.gameTime : 0;
        // NOTE: deliberately NOT gated on hellDetected. 150 minutes can only
        // be hell, and if the latch was missed (a stray results-screen click,
        // a reload mid-run) the posture that matters most must still engage.
        // v6.88.4 (user): "deep hell once bosses don't drop tips and the boss
        // damage ring becomes as large as the canvas — anchor towards corner
        // and spam ultimate". The RING is the observable signal; the clock is
        // only a fallback for when no boss is on screen. Either fires it.
        const canvasW = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
        const ringHuge = th.enemies.some(e => e.boss && (e.r || 0) * 2 >= canvasW * 0.55);
        // v6.89.3 (user): "kiting for unkillable mobs is useless, and anchoring
        // in corner with southside to theoretically be able to kill the contact
        // mobs is better in order to land a timestop ... so anchoring might be
        // able to be employed much earlier ... except to hunt down bosses."
        //
        // That is a complete doctrine, and it inverts the old gate. Kiting only
        // pays while the pack can be outrun and killed; past the point where mob
        // HP has scaled beyond the build, dragging a conga line achieves nothing
        // except covering ground. The corner does two things kiting cannot: it
        // collapses the approach arc from 360 degrees to about 90, and it parks
        // the SOUTH SIDE burn — which is BODY-CENTRED — exactly where the funnel
        // delivers bodies. Kills are how a TIME STOP drops, and the time stop is
        // what the whole deep build runs on.
        //
        // So the corner no longer waits for a clock at all when the burn exists:
        // hell + SOUTH SIDE owned is the condition. The clock and the huge ring
        // stay as fallbacks for a build that never got the zoner.
        //
        // THE EXCEPTION IS THE USER'S OWN: a boss on the field is worth breaking
        // the corner for. That also keeps the 1800-4800 tip window intact, since
        // farming frozen bosses IS boss hunting — the phase that funds the run
        // is protected by the same clause that names it.
        // ...and the exception is SCOPED to the phase that makes it true. In
        // deep hell there is essentially always a boss on the field, so a bare
        // "any boss breaks the corner" would switch the corner off forever —
        // the same dead-gate mistake in reverse. Bosses are worth hunting while
        // they still DROP TIPS; the doctrine's own definition of deep hell is
        // the moment they stop. So the hunt exception expires with the window.
        const tipOpen = gtCorner < (CONFIG.deepHell.tipWindowToS || 4800);
        // v6.89.5 (user): "bot should hunt down time stopped or frozen bosses
        // early to kill them before they cause severe damage though."
        //
        // A frozen boss is the one target on the field that cannot fight back,
        // and every one left alive comes back later as the thing that ends the
        // run. So this exception is NOT scoped to the tip window the way plain
        // boss-hunting is: a free kill is worth leaving the funnel for at any
        // depth. Same predicate the stacking station uses below (>= 45 frames
        // left), so the corner releases exactly when that station would engage,
        // rather than the two fighting over the heading.
        const frozenBossHere = th.enemies.some(e =>
            e.boss && !e.wall && e.frozen && (e.frozenLeft || 0) >= 45);
        const bossHunt = frozenBossHere || (th.boss === true && tipOpen) || !!th.rival;
        const zonerCorner = CONFIG.deepHell.cornerWithZoner !== false && hellDetected && zoner;
        // v6.89.8 PANIC AND FLIGHT MEAN *GO TO THE CORNER*, NOT GO ANYWHERE.
        //
        // This gate was the real reason the corner never held. `flight` is
        //   hellDetected && !pauseActive && unkillable && near >= 4 && !hpPanic
        // and at depth every one of those is permanently true except during a
        // time stop — `toughnessAvg` is enormous, `near` is in the hundreds. So
        // `!flight` switched the corner OFF for all of deep hell EXCEPT the
        // seconds a pause was holding the field. Sixty versions of corner
        // doctrine, `cornerAnchorFromS`, `cornerWithZoner` and `cornerPull` were
        // all downstream of a term that was almost never allowed to fire. It
        // explains the 127 px `cornerDist` measured at 120 minutes far better
        // than "cornerPull is losing to the flee terms" did — the corner pull
        // was not losing the argument, it was not in the room.
        //
        // `hpPanic` is the same mistake in miniature: the moment the bot is
        // actually hurt is the moment it most needs the mark-immune corner, and
        // that is exactly when the gate revoked it.
        //
        // Past `deepCornerFromS` both are demoted from vetoes to non-events:
        // running away and panicking both resolve to "get to the corner", which
        // is the only place at depth where anything is safer (marks cannot reach
        // it — 80.9 px against a 70 px reach). Shallow hell and the day are
        // untouched: there, fleeing genuinely opens a gap and the veto is right.
        //
        // `markHere` still breaks it — standing inside a falling attack is the
        // one time to move regardless — and so does `bossHunt`.
        const deepCorner = hellDetected &&
            gtCorner > (CONFIG.deepHell.deepCornerFromS != null ? CONFIG.deepHell.deepCornerFromS : 2400);
        // Corner coordinates, hoisted above the gate: v6.89.11 needs to ask
        // whether the SEAT is safe, not only where the bot is standing.
        const fieldW = (typeof G.W === 'number' && G.W > 0) ? G.W : CONFIG.field.w;
        const fieldH = (typeof G.H === 'number' && G.H > 0) ? G.H : CONFIG.field.h;
        const pr = (typeof p.r === 'number' && p.r > 0) ? p.r : 12;
        const cnrX = (p.x < fieldW / 2) ? pr : fieldW - pr;
        const cnrY = (p.y < fieldH / 2) ? pr : fieldH - pr;
        // v6.89.11 THE CORNER DOES NOT DEFEAT A CHARGE LANE (user: "anchoring
        // contradicting the linebacker boss").
        //
        // The corner earns its place against DROP-MARKS, which are bounded
        // circles from a known spawn box — the true corner sits 80.9 px from the
        // nearest possible mark centre against a 70 px reach, so it is outside
        // every mark that can exist. That argument does not transfer.
        //
        // A Last Call Linebacker charge lane is `{x, y, ang, armed, dmg}` — an
        // unbounded RAY, killing 63 px to each side by perpendicular distance.
        // No point in the arena is outside a ray. Corner position confers
        // exactly zero protection, and it makes matters worse: escaping a lane
        // means moving perpendicular to it, and a corner has removed three
        // quarters of the directions available to do that.
        //
        // The gate had no lane term at all. It checked `markHere` and nothing
        // else, and at depth `bossHunt` only fires for a FROZEN boss or a rival
        // — so a live charging linebacker could not break the anchor either.
        //
        // Unarmed lanes count on purpose: `armed: false` is the telegraph, which
        // is precisely the window in which not to commit to a seat that is about
        // to become a kill zone. Breaking the corner hands the heading back to
        // lineCost's gradient, which drives the perpendicular step.
        //
        // v6.89.13 REGRESSION FIX — THE CORNER WAS PERMANENTLY DISABLED.
        // A live probe at gt 7622 returned `lineOnCorner: true` with
        // `lines: 0` — zero roadLines in the game, yet the veto was firing.
        //
        // `th.lines` is not only roadLines. A THROWER in its vomit windup
        // pushes a SYNTHETIC segment `{x1: e.x, y1: e.y, x2: p.x, y2: p.y}`
        // (see the gather above) — a firing line drawn from the thrower TO THE
        // PLAYER, so it can be pre-dodged. That segment ENDS at the player's
        // exact position, so `lineCost(l, p.x, p.y)` is a zero-distance hit and
        // returns 1 every single time. Any thrower winding up anywhere on the
        // field therefore made `lineHere` true, which made `lineOnCorner` true,
        // which switched the corner off — and at depth there is always a
        // thrower winding up.
        //
        // Only REAL charge lanes may veto the corner. The source-verified
        // roadLine shape carries a numeric `ang`; the synthetic thrower line
        // does not, and it is already handled by laneUrgent and the flee terms.
        const laneCovers = (x, y) => th.lines.some(l =>
            l && typeof l.ang === 'number' && lineCost(l, x, y) > 0.15);
        const lineHere = laneCovers(p.x, p.y);
        const lineOnCorner = laneCovers(cnrX, cnrY) || lineHere;
        const cornerOn = !markHere && !lineOnCorner && !bossHunt &&
            (deepCorner || (!hpPanic && !flight)) &&
            (zonerCorner || ringHuge || gtCorner > (CONFIG.deepHell.cornerAnchorFromS || 9000));
        // USER-VERIFIED: Corpse Reviver zombies can hit NEITHER passouts NOR
        // no-booking walls — a CR-only build farms both at base-attack speed,
        // so the detour incentive is cut for each. (Hoisted out of the
        // candidate loop — audit fix: was recomputed 33x per tick, twice.)
        const crOnly = (ownedLevels['CORPSE REVIVER NO.2'] || 0) > 0 && ownedCocktailCount() === 1;
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
            (flameOn ? 1.6 : 1) *       // burn window: harvest everything it touches
            (flight ? 0.15 : 1);        // FLIGHT: nothing is worth stopping for

        // ULT AIMING. The ultimate spirals OUTWARD from the bot, so the aim
        // point is where the bot's body should be when it fires.
        // v6.85.8 (user): "the ultimate for Pat is different from minguk's in
        // that it spirals out and the passouts NEAREST the ultimate get the
        // most damage." A flat centroid is the wrong aim under falloff — it
        // averages a spread-out group into a point that can be far from every
        // member of it. Weighting each passout by 1/(d+60) collapses the aim
        // onto the densest nearby cluster instead, and leaves a single
        // point-blank passout as a perfectly good target.
        const ultFall = charOf().ultFalloff === true;
        let poCx = 0, poCy = 0, poN = 0, poW = 0, poNearest = null;
        for (const po of th.passouts) {
            if (po.contested) continue;
            const dpo = Math.hypot(po.x - p.x, po.y - p.y);
            if (dpo >= 240) continue;
            const w = ultFall ? 1 / (dpo + 60) : 1;
            poCx += po.x * w; poCy += po.y * w; poW += w; poN++;
            if (poNearest == null || dpo < poNearest) poNearest = dpo;
        }
        if (poW) { poCx /= poW; poCy /= poW; }
        // v6.86.4: banking is only worth positioning for when the blast is near
        // v6.86.12: banking only makes sense for an ult that must be NEAR its
        // targets. Minguk's nuke hits every enemy on the field at any range
        // and explicitly includes passouts, so walking his 120 HP into the
        // pile at 4x the normal pull weight buys nothing and spends the
        // spacing that keeps a runner alive. Harvest is for melee ults.
        const meleeUlt = charOf().ultKind && charOf().ultKind !== 'nuke';
        const ultHarvest = meleeUlt && poN >= 1 && (ultReadyNow || ultInS <= M.ultHarvestLeadS) &&
            !hpPanic && !markHere && !projHere;

        // FIELD TREK (v6.85.10, user: "it needs to clear all bosses including
        // no booking mobs and passouts in day" — with a 17:59 screenshot
        // showing ~20 uncleared passouts). Once nothing farmable is left in
        // the local window the bot had no reason to go anywhere, so it sat and
        // re-farmed its corner while the far pile grew. Pick exactly ONE
        // distant target and walk to it: oldest first, since they despawn and
        // the user's kill order is FIFO, frailest as the tie-break. Day only
        // (hell is about survival, not the floor), healthy only, and never
        // while a NO BOOKING wall or the finale rival owns the field.
        const gtTrek = typeof G.gameTime === 'number' ? G.gameTime : 0;
        let trekPo = null;
        if (!hellDetected && gtTrek < 1200 && !hpPanic && !th.rival && !rainbowRecent && !wallFocus &&
            !th.passouts.some(po => !po.contested && !po.far)) {
            for (const po of th.passouts) {
                if (po.contested || !po.far) continue;
                if (!trekPo || po.id < trekPo.id ||
                    (po.id === trekPo.id && po.maxHp < trekPo.maxHp)) trekPo = po;
            }
        }

        // CONTACT IMMINENT (hell): a live body whose predicted step lands on
        // us. In hell these scale past what the supers can kill, so the only
        // answers are the dash and the ult's invincibility window.
        let contactImminent = false;
        if (hellDetected && !pauseActive) {
            const horizon = 12 + (DH.horizonFrames - 12) * depth;   // deep hell: see the lunge earlier
            for (const e of th.enemies) {
                if (e.wall || e.frozen) continue;
                if (e.distant) continue;   // v6.88.0 AUDIT D3: off-canvas, gathered only for the ring
                const fx2 = e.x + e.vx * horizon, fy2 = e.y + e.vy * horizon;   // ~0.2s ahead (longer at depth)
                const pad = ((e.boss || e.rival) ? 26 : 12) * (1 + (DH.bossPadMul - 1) * depth);
                if (Math.hypot(fx2 - p.x, fy2 - p.y) < e.r + pad) { contactImminent = true; break; }
            }
        }

        // TIME-STOP STACKING (user): during an item time pause in hell with
        // SOUTH SIDE owned, the paused boss is a free damage sponge — stand
        // ON it and let the burn zones stack. Only while the freeze has
        // ≥0.75s left (the karaoke lesson: leave BEFORE it wakes).
        // v6.85.11 (user: "the bot is not using SOUTH SIDE attacks well for
        // frozen bosses in hell"). `!projHere` gated the WHOLE branch, and
        // projHere is true whenever any enemy shot sits within q.r + 130 —
        // which in hell is very nearly always. The stacking window therefore
        // almost never opened in a real run. A frozen boss cannot act; the
        // reason to fear a shot is unrelated to whether we stack on it, and
        // the danger field still routes around live projectiles on its own.
        let stopBoss = null;
        if (hellDetected && zoner) {
            for (const e of th.enemies) {
                if (!e.boss || e.wall || !e.frozen || e.frozenLeft < 45) continue;
                const dd = Math.hypot(e.x - p.x, e.y - p.y);
                if (!stopBoss || dd < stopBoss.d) stopBoss = { x: e.x, y: e.y, d: dd, r: e.r, left: e.frozenLeft };
            }
        }

        // Hoisted so the reported diagnostic is literally the number the
        // planner steers to — a separately-computed label can drift from the
        // behaviour and then "tests" the label instead of the bot.
        // v6.88.4 (user): "30-80 minutes hell - fast kill of frozen bosses via
        // timestop or whisky sour by sitting ON TOP of their damage circle
        // while the bosses still drop tips". Tips are the SUPER EVOLUTION
        // TRIGGER (openRecipe: "base attack MAX + cocktail Lv6 + key MAX ->
        // evolve at a BOSS TIP"), so this window is where the four-line plan
        // actually cashes in — and a frozen boss cannot punish contact. The
        // zone-damage predicate is `hypot(e.x-z.x, e.y-z.y) < z.r + e.r`, i.e.
        // SOUTH SIDE's burn lands on the hitbox circle, so standing on it is
        // where the damage is. Outside that window the old standoff stands.
        const gtStop = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const tipWindow = hellDetected &&
            gtStop >= (CONFIG.deepHell.tipWindowFromS || 1800) &&
            gtStop <= (CONFIG.deepHell.tipWindowToS || 4800);
        const stopStation = stopBoss
            // ...but ONLY while the freeze is actually holding. The first cut
            // dropped the station to point-blank for the whole window and the
            // existing time-stop tests caught it: parked on the hitbox with the
            // pause running out is exactly where the wake-up burst lands. The
            // >120-frame guard is the same one the old close-station used.
            ? ((tipWindow && (stopBoss.left || 0) > 120) ? Math.max(20, (stopBoss.r || 40) * 0.5)
                : ((stopBoss.left || 0) > 120 ? (stopBoss.r || 40) + 40 : Math.max(150, (stopBoss.r || 40) + 90)))
            : null;

        // v6.86.7 FLAME AIM. While the cross burns, the damage goes where the
        // bot is FACING — so choose what to point at before scoring headings.
        // Priority follows what the burn can actually cash in: a passout it
        // could never out-damage otherwise, then a wall, then a boss, then
        // whatever is closest.
        let flameTarget = null;
        if (flameOn && !hpPanic) {   // hurt: survive first, the burn is offence
            let bestF = -Infinity;
            const consider = (x, y, w) => {
                const d = Math.hypot(x - p.x, y - p.y);
                if (d > M.flameAimRange) return;
                const sc = w / (1 + d / 200);
                if (sc > bestF) { bestF = sc; flameTarget = { x, y, d }; }
            };
            for (const po of th.passouts) if (!po.far) consider(po.x, po.y, 3);
            for (const e of th.enemies) consider(e.x, e.y, e.wall ? 2.5 : (e.boss ? 2 : 1));
        }

        // v6.89.6/7 THE KITE WEIGHT, hoisted: every factor here is constant
        // across the candidate sweep, and it now has two arms.
        //
        // The SWEEP (the conga line dragged through the burn) is damped by
        // everything that wants the bot to hold still — anchor, corner, build
        // completeness, pause.
        //
        // The SPACING step is not: it is only ever armed with a body already
        // inside the band, and a 0.12x corner factor would crush the one
        // sidestep that prevents a contact death.
        //
        // v6.89.7 CAPS the spacing arm instead of trusting a default. 6.89.6
        // claimed the corner outbids it — "cornerPull 4.0 * 0.5 = 2.0 against
        // kitePull 2.0 * 0.6 = 1.2" — but `movement.kitePull` is IN THE CEM BOX
        // (min 0.5, max 4.0) and a live read caught it at 2.223 and climbing.
        // At the box ceiling the spacing arm reaches 2.4 and beats the corner,
        // so the invariant would silently invert mid-run while the unit test,
        // which reads the static default, passed forever. The margin is now
        // enforced against the corner's ACTUAL weight, every tick.
        const kiteBaseW = M.kitePull * charOf().kiteMul * (zoner ? 1.6 : 1) *
            (knocker && th.boss ? 1.25 : 1) * (rainbowRecent ? 1.4 : 1) *
            (flight ? (grind ? M.grindKiteMul : 1.8) : 1);
        let kiteW;
        if (kiteSpacing) {
            const ceil = (CONFIG.deepHell.cornerPull || 4) * 0.5 *
                (CONFIG.deepHell.spacingCeilShare != null ? CONFIG.deepHell.spacingCeilShare : 0.6);
            kiteW = Math.min(kiteBaseW * (M.kiteSpacingMul != null ? M.kiteSpacingMul : 0.6), ceil);
        } else {
            // v6.89.3: cornered means STOP sweeping — the two pulls fight, and
            // the corner is the one that keeps the bot alive.
            kiteW = kiteBaseW * (anchor ? 0.35 : 1) * (cornerOn ? 0.12 : 1) * kiteDamp;
        }

        let best = null;
        const N = M.samples;
        for (let i = 0; i <= N; i++) {
            let dx, dy;
            if (i === N) { dx = 0; dy = 0; }              // the "stand still" candidate
            else { const a = (i / N) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }

            const nx = Math.max(0, Math.min(fw, p.x + dx * step));
            const ny = Math.max(0, Math.min(fh, p.y + dy * step));

            // v6.86.2: distance from THIS candidate to the nearest live body.
            // fireBase() shoots nearestEnemy() measured from the PLAYER, so
            // this is the number the passout station has to beat: standing
            // closer to the passout than to any mob is the only way the base
            // attack ever points at it. (6.86.1 compared the wrong pair — it
            // asked whether the player was nearer the passout than the MOBS
            // were, which is a different and usually unwinnable condition
            // when a mob is chasing us and the passout is parked.)
            let candNearestLive = Infinity;
            for (const e of th.enemies) {
                if (e.wall) continue;
                const de = Math.hypot(nx - e.x, ny - e.y) - (e.r || 0);
                if (de < candNearestLive) candNearestLive = de;
            }

            let danger = 0;

            for (const e of th.enemies) {
                // v6.88.0 AUDIT D3: a distant boss is gathered ONLY so the
                // firing-ring term can see it. Letting it into the danger field
                // made the planner flee the target it was being paid to close on.
                if (e.distant) continue;
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
                    // MOJITO SNIPER DEFERRAL — REMOVED in v6.85.8.
                    // The rule was: with MOJITO >= 3 and a free passout, leave
                    // the boss to the sniper and keep the body on the farm.
                    // 6.85.6 made it hell-only, 6.85.7 made it yield to SOUTH
                    // SIDE, and the user then settled it outright: "mojito
                    // doesn't kill the holdouts." The premise was false, so the
                    // conditional variants were patching a rule that should
                    // never have existed. Bosses are engaged on their merits.
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
                    // v6.85.19 (user: "the bot is still not able to register
                    // the hit radius that's invisible ... outside the visible
                    // canvas"). 6.85.18 added the PULL toward an off-canvas
                    // boss but left the normal standoff ring (240 day), which
                    // is outside weapon reach of a body that is mostly beyond
                    // the edge — the bot approached, parked, and never hit it.
                    // When the centre is off-canvas the standoff logic is
                    // moot (the body cannot chase onto the field any faster
                    // than it drifts), so the station collapses to just
                    // outside the contact band of whatever sliver of the hit
                    // circle reaches on-canvas. The edge-clamped candidates
                    // then hug the nearest edge/corner point automatically.
                    if (e.offCanvas) ring = Math.min(ring, (e.r || 40) + 34);
                    bossRingRef.v = ring;
                    const errNow = Math.abs(Math.hypot(p.x - e.x, p.y - e.y) - ring);
                    const errNew = Math.abs(Math.hypot(nx - e.x, ny - e.y) - ring);
                    // v6.85.6: day bosses outrank the passout farm (user).
                    // The passout pull is already amplified 1.35x by dayFarm
                    // before 1200s, which made a boss and a passout roughly
                    // equal bids; the boss is worth more because its loot is
                    // what levels the ult that then clears the passouts.
                    const dayBossPush = (!hellDetected && gtNow2 < 1200) ? 1.5 : 1;
                    gain += M.bossEngageValue * dayFarm * dayBossPush * (errNow - errNew) * 0.12;
                }
            }

            // Passout farming: walk INTO weapon range of passed-out customers
            // (they drop gold + XP), but don't wedge into their hitbox. Greed
            // is muted while panicking or during the hell-entry window.
            if (th.passouts.length && !hpPanic && !th.rival && !rainbowRecent) {
                // USER KILL ORDER: the frailest passout (lowest max HP) dies
                // first — fastest loot per second — and among peers, the one
                // that FELL FIRST (lowest id) before it despawns.
                // v6.85.14 FOCUS FIRE (user: "still not clearing the
                // passouts towards the 10 minute mark and it keeps piling up
                // ... delaying the upgrades when entering initial hell mode").
                // The bug: frailHp/firstId were computed for the USER KILL
                // ORDER and then NEVER USED — every free passout applied its
                // own ring gradient simultaneously, so with several on the
                // field the bot steered toward the SUM of the pulls: a
                // compromise point between rings (probe: 3 passouts, heading
                // chosen toward the farthest). It orbited between them,
                // finished none, and the pile grew while their maxHp scaled.
                // Now exactly ONE passout is the station target.
                // v6.85.17: the kill order is LOOT PER SECOND, and loot per
                // second includes the walk. Frailest-first alone is distance-
                // blind — it sent the bot across the map for a marginally
                // weaker target while a near one sat uncleared (sim, 500-tick
                // 10-minute drizzle: 8 kills). Scoring hp + 0.5*distance keeps
                // the frailty logic but charges transit for it (same sim: 13
                // kills, +62%). Fell-first (lowest id) still breaks ties.
                let tgtPo = null, tgtScore = Infinity; let poTtk = null;
                for (const po of th.passouts) {
                    if (po.contested || po.far) continue;
                    if (poGiveUp.has(po.id)) continue;   // v6.86.2: measured unkillable this run
                    const sc = po.maxHp + M.killOrderDist * Math.hypot(po.x - p.x, po.y - p.y);
                    if (sc < tgtScore || (sc === tgtScore && tgtPo && po.id < tgtPo.id)) { tgtScore = sc; tgtPo = po; }
                }
                // v6.86.2 FEASIBILITY. Watch the HP actually coming off the
                // station target while we are in range of it. If the damage
                // going in projects a kill time past the budget — or no
                // damage lands at all — the body is scenery for the rest of
                // the run: it deals no contact damage, and the seconds are
                // worth more spent levelling. Only in-range time counts, so
                // the walk over never condemns a passout.
                if (tgtPo) {
                    const nowPo = Date.now();
                    if (poTrack.id !== tgtPo.id) {
                        poTrack = { id: tgtPo.id, hp: tgtPo.hp, at: nowPo, inRangeS: 0, dps: 0 };
                    } else {
                        const dt = (nowPo - poTrack.at) / 1000;
                        if (dt >= 0.4) {
                            const inRange = (Math.hypot(tgtPo.x - p.x, tgtPo.y - p.y) - tgtPo.r) < M.poEngageRange;
                            if (inRange) poTrack.inRangeS += dt;
                            const drop = poTrack.hp - tgtPo.hp;
                            if (drop > 0) {
                                const inst = drop / dt;
                                poTrack.dps = poTrack.dps > 0 ? poTrack.dps * 0.7 + inst * 0.3 : inst;
                            }
                            poTrack.hp = tgtPo.hp;
                            poTrack.at = nowPo;
                        }
                    }
                    // The probe measures BASE-ATTACK dps, and the base attack
                    // is not the tool that clears a grown passout — the ult
                    // and the flame cross are. While either is up (or nearly
                    // up), a slow burn is not evidence of hopelessness.
                    const ultAt = safe(() => player.ultReadyAt, Infinity);
                    const ultUpSoon = flameOn || (typeof ultAt === 'number' && (gtDeepP + 12) >= ultAt);
                    const budget = hellDetected ? M.poTtkBudgetHellS : M.poTtkBudgetS;
                    poTtk = poTrack.dps > 0 ? tgtPo.hp / poTrack.dps : Infinity;
                    poTtkOut = poTtk; poDpsOut = poTrack.dps;
                    if (poTrack.inRangeS >= M.poProbeS && poTtk > budget && !ultUpSoon) {
                        poGiveUp.add(tgtPo.id);
                        log('passout', tgtPo.id, 'abandoned — ' +
                            (poTrack.dps > 0 ? Math.round(poTtk) + 's to kill at ' + Math.round(poTrack.dps) + ' dps'
                                             : 'no damage landing') +
                            ' (budget ' + budget + 's, hp ' + Math.round(tgtPo.hp) + ')');
                        tgtPo = null;
                    }
                }
                // Corpse Reviver zombies CANNOT hit passouts (user-verified):
                // with CR as the only cocktail, farming them is slow
                // base-attack work — cut the detour incentive.
                for (const po of th.passouts) {
                    if (po.contested) continue;   // surrounded by live enemies: not worth the dive
                    // v6.85.10: a far passout is a TRAVEL target, not a
                    // station. Twenty of them scattered across the field each
                    // applying a full ring gradient sums to mush and the bot
                    // stands still; the single-target trek below handles them.
                    if (po.far) continue;
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
                    // v6.85.22: the pat curve now reads CONFIG.patRing so the
                    // CEM can search it. CHARS keeps the calibrated defaults.
                    const dayRing = dr
                        ? (gtRing < 180 ? CONFIG.patRing.early : (gtRing < 600 ? CONFIG.patRing.mid : CONFIG.patRing.late))
                        // DAY (minguk-calibrated): hold ~124px — weapons reach,
                        // falls and contact do not. Tight day rings were the
                        // 7-12 minute contact deaths.
                        : (phR === 'early' ? 118 : phR === 'mid' ? 112 : 105);
                    let ring = po.r + ((hellDetected || gtRing > 1200) ? hellRing * slowPad
                        : dayRing * slowPad);
                    const zone = po.r + 18;
                    // v6.85.9 (user): "pat also needs to use flame cross to kill
                    // passouts as other weapons don't do much damage to them."
                    // The flame cross is a BODY-CENTRED burn, not a projectile —
                    // its damage only reaches what the bot is standing next to.
                    // Farming a passout from Pat's 165px day station during the
                    // window spends the whole cross on empty floor. While it is
                    // burning, the station collapses to just outside the contact
                    // zone so the flame actually covers the body. The zone
                    // itself is still off-limits: contact ticks are what the
                    // 55-danger retreat gradient below exists to prevent.
                    // v6.86.7: the station no longer collapses during a burn.
                    // The cross is NOT a body-centred aura — the source fires
                    // three projectiles every 3 frames along the AIM vector at
                    // speed 9-11 ("레인보우건급", rainbow-gun class). It is a
                    // directional flamethrower, so what matters is pointing it
                    // at the target, not standing on it.

                    // v6.86.1 HUG THE STATION TARGET. Two source facts kill
                    // the standoff ring for a FREE passout:
                    //   1. fireBase() shoots `nearestEnemy()` over all
                    //      enemies — so while any live mob is closer than the
                    //      passout, not one base attack lands on it. At the
                    //      105-245px ring that was almost always true.
                    //   2. passouts deal no contact damage (see gatherLoot),
                    //      so there is nothing to stand off FROM.
                    // Pat felt this hardest: 59-frame single shots, no pierce
                    // to leak past the mob it was actually targeting.
                    // A contested passout keeps the old ring — the live
                    // bodies around it are the real reason to stand back.
                    // v6.86.4: the hug is RETRACTED. It was built on the theory
                    // that fireBase()'s nearestEnemy() had to point at the body
                    // — but the body carries 13k HP by minute 4 and 1.8M by
                    // minute 19, so base attacks never kill one either way.
                    // The manual demo stands at 61-94px (median 82 centre,
                    // ~45 from the edge), which is what patRing already said.
                    const hug = false;
                    const dNow = Math.hypot(p.x - po.x, p.y - po.y);
                    const d1 = Math.hypot(nx - po.x, ny - po.y);
                    if (dNow < zone) {
                        // v6.86.4: the cost of being ON the body is BLOCKAGE,
                        // not damage — the game shoves the player out and the
                        // step is wasted, which can pin us against a wall in a
                        // crowd. The magnitude that was tuned as a contact
                        // gradient turns out to be right for the pathing cost,
                        // so it stands; only the reasoning changed.
                        danger += 55 * (1 - Math.min(1, d1 / (zone + 30)));
                    } else {
                        if (po === tgtPo) gain += M.passoutValue * (crOnly ? 0.4 : 1) *
                            (Math.abs(dNow - ring) - Math.abs(d1 - ring)) * 0.15;
                        // never path through an impassable body to reach the far side
                        if (d1 < zone || distPointSeg(po.x, po.y, p.x, p.y, nx, ny) < zone) danger += 60;
                    }
                }
            }

            // standoff: hold a productive distance from the crowd so weapons
            // keep firing (widened automatically when the wave is swarm-heavy)
            if (th.enemies.length && !panic) {
                const errNow = Math.abs(Math.hypot(p.x - cx, p.y - cy) - standoffAdj);
                const errNew = Math.abs(Math.hypot(nx - cx, ny - cy) - standoffAdj);
                // v6.88.2: past the corner-anchor threshold the standoff ring
                // is the thing being overridden — holding a mark-proof corner
                // beats holding a firing distance from a crowd that cannot be
                // outrun anyway (mobs pass the player's speed at ~11 minutes).
                gain += M.standoffPull * (errNow - errNew) * 0.28 * (anchor ? 0.4 : 1) * (cornerOn ? 0.25 : 1);
            }
            // v6.88.2 CORNER ANCHOR pull (see the derivation above).
            if (cornerOn) {
                const cNow = Math.hypot(p.x - cnrX, p.y - cnrY);
                const cNew = Math.hypot(nx - cnrX, ny - cnrY);
                gain += (CONFIG.deepHell.cornerPull || 4.0) * (cNow - cNew) * 0.5;
            }

            // TIME-STOP STACKING — DEMO-CORRECTED (81-min manual stall run:
            // paused-boss distance p10 140 / med 254; the body is NEVER
            // hugged). Hold a SOUTH SIDE firing station ~150px out: the
            // flame rain and CAMPARI shred still land, but the wake-up burst
            // can't reach. Pull toward the station from either side.
            // v6.85.6 (user directive): "use SOUTH SIDE to kill bosses in hell
            // while not staying too close when the bot picked up TIME STOP."
            // The station distance was already right (150px, from the 81-min
            // stall run) and the spring is symmetric, so "not too close" was
            // already handled — an explicit inner danger term was tried and
            // measured to change nothing, because at 60px the spring alone
            // already bids 50+ to step outward. What was wrong is the WEIGHT:
            // 26 is about what an ordinary passout detour bids, so on a busy
            // field the station lost to the farm and the free damage window
            // went unused. 44 makes the paused boss the priority it was
            // described as.
            // FIELD TREK: close on the one chosen distant passout. Plain
            // distance, not a ring — the ring gradient takes over as soon as
            // it comes inside the local window and stops being `far`.
            if (trekPo) {
                const eNowT = Math.hypot(p.x - trekPo.x, p.y - trekPo.y);
                const eNewT = Math.hypot(nx - trekPo.x, ny - trekPo.y);
                gain += 26 * (eNowT - eNewT) * 0.2 * dayFarm;
            }

            if (stopBoss) {
                // v6.85.11: SOUTH SIDE is a GROUND weapon — the same fact that
                // drove 6.85.7 and 6.85.9. Its burn lands where the bot's body
                // is, so a flat 150px station meant the boss was never inside
                // the zones at all and the "stacking" window did nothing. The
                // station is now two-phase: while the freeze has real time left
                // (>2s) stand at burn range so the rain covers the body, and as
                // the clock runs down fall back to the old safe ring so the
                // wake-up burst cannot reach. The <45-frame exclusion above
                // still drops the target entirely before it moves.
                const eNowS = Math.abs(Math.hypot(p.x - stopBoss.x, p.y - stopBoss.y) - stopStation);
                const eNewS = Math.abs(Math.hypot(nx - stopBoss.x, ny - stopBoss.y) - stopStation);
                gain += M.stopBossPull * (eNowS - eNewS) * 0.2;
            }

            // ult centering: with 2+ passouts, drift onto their centroid so
            // the outward spiral catches the whole group
            // v6.85.8: under falloff, ONE passout is worth closing on, and the
            // `anchor` gate (HP > 0.7 plus OLIVE/NEGRONI >= 2) kept the bot off
            // the cluster for the whole early day — exactly the window where
            // the user wants passout loot funding the ult. The gate is now the
            // safety half of `anchor` only: hurt, or a blast/shot overlapping
            // the stand position, still suspends it.
            // v6.86.7: pay for pointing the flamethrower at the target. dx,dy
            // is a unit heading, so this is the cosine of the angle between
            // the stream and the target — the planner turns to face it while
            // still free to keep its distance.
            if (flameOn && flameTarget && !hpPanic) {
                const tl = Math.max(1, flameTarget.d);
                gain += M.flameAimValue * ((dx * (flameTarget.x - p.x) + dy * (flameTarget.y - p.y)) / tl);
            }

            // v6.86.4 HARVEST WINDOW. The demo's whole passout economy is
            // positional: the human drifts onto the pile as the ult comes off
            // cooldown and detonates from ~78px. So the centroid pull is weak
            // background behaviour until the ult is within ultHarvestLeadS,
            // then it becomes the dominant term.
            const ultAimOk = ultFall ? (poN >= 1 && !hpPanic && !markHere && !projHere) : (anchor && poN >= 2);
            if (ultAimOk) {
                const eNow = Math.hypot(p.x - poCx, p.y - poCy);
                const eNew = Math.hypot(nx - poCx, ny - poCy);
                const w = ultHarvest ? M.ultHarvestPull : (ultFall ? 22 : 14);
                gain += w * (eNow - eNew) * 0.15;
            }

            // kiting sweep + gap escape
            // v6.86.1: while joe's Untouchable is up, the spikes are the whole
            // point — walk INTO the densest body cluster inside their reach
            // instead of kiting it. Invulnerable, so this costs nothing.
            if (auraUlt) {
                const reach = charOf().ultReach || 156;
                for (const e of th.enemies) {
                    const d1e = Math.hypot(nx - e.x, ny - e.y), d0e = Math.hypot(p.x - e.x, p.y - e.y);
                    if (d0e < reach * 2.2) gain += (d0e - d1e) * 0.9;
                }
            }
            if (kite && i !== N) gain += (dx * kite.x + dy * kite.y) * kiteW;
            if (escape && i !== N) gain += (dx * escape.x + dy * escape.y) * M.escapePull * (flight ? (grind ? M.grindKiteMul : 1.8) : 1);

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

        // ================== v6.90.0 DEEP PARK ==================
        // The measured A/B, not a model. Bot ON: median run 22 minutes. Bot
        // OFF, player parked in a corner at 258 enemies: 309/309 -> 306/309
        // across 155 seconds, still going at 125 minutes. A player doing
        // NOTHING outlives the bot by a factor of five.
        //
        // Sixty versions have tuned kiting, standoff, escape, flee, loot pulls
        // and boss engagement. At depth the correct value of all of them is
        // zero: they are what carries the bot out of the only stable position
        // on the board. This does not re-weight them — it overrides them, which
        // is the only faithful implementation of "what the stopped bot did".
        //
        // Walk to the corner; on arrival, STOP. Two exceptions, both handed
        // straight back to the normal planner:
        //   markHere      — a drop-mark overlapping us is the one thing worth
        //                   moving for, and the corner is otherwise geometrically
        //                   mark-immune (80.9 px against a 70 px reach).
        //   lineOnCorner  — a charge lane is an unbounded RAY; no point in the
        //                   arena is outside it, so the corner cannot defeat it.
        const DHp = CONFIG.deepHell;
        const parkArmor = (ownedLevels['OLIVE'] || 0) >= (DHp.parkOliveLv || 6);
        const parkRegen = (ownedLevels['WATER'] || 0) >= 4 || (ownedLevels['SIMPLE SYRUP'] || 0) >= 2;
        const parkOn = DHp.park !== false && hellDetected && parkArmor && parkRegen &&
            gtCorner > (DHp.parkFromS != null ? DHp.parkFromS : 1800) &&
            !markHere && !lineOnCorner;
        let parked = false;
        if (parkOn) {
            const dCnr = Math.hypot(p.x - cnrX, p.y - cnrY);
            if (dCnr <= (DHp.parkRadius || 26)) { vx = 0; vy = 0; parked = true; }
            else { vx = (cnrX - p.x) / dCnr; vy = (cnrY - p.y) / dCnr; }
        }
        lastDir = { x: vx, y: vy };

        // v6.89.8 CORNERWARD. Source-verified: `tryDash` sets only dashDx/dashDy/
        // dashUntil — it grants NO invulnerability and no i-frames. It is a
        // 0.16 s movement burst, i.e. a pure MULTIPLIER on the heading the
        // planner already chose, and therefore only ever as good as that
        // heading. In panic the heading is a flee vector, so dashing there
        // carries the bot OUT of its corner faster (user, observed). The
        // abilities layer needs to know which way this heading points before it
        // can decide whether amplifying it is a good idea.
        const cornerward = Math.hypot(cnrX - p.x, cnrY - p.y) > 1
            ? ((vx * (cnrX - p.x) + vy * (cnrY - p.y)) / Math.hypot(cnrX - p.x, cnrY - p.y)) > 0.2
            : true;

        return {
            dx: vx, dy: vy, cornerward, markHere, parkOn, parked,
            danger: best.danger, gain: best.gain, hpRatio, panic, hpPanic, slowMul,
            pauseActive, contactImminent, flight, grind, depth: +depth.toFixed(2),
            blastImminent: th.marks.some(m => typeof m.tLeft === 'number' && m.tLeft <= 0.45 &&
                Math.hypot(m.x - p.x, m.y - p.y) < m.r),
            surge: surgeActive, hellRecent, rainbowRecent, projImminent, laneUrgent, rivalUrgent, frozenUrgent, sprinterUrgent, stacking: !!stopBoss, flameAnchor, cornerAnchor: cornerOn, stackStation: stopStation, chase: !!th.rival, zoner, knocker, anchor, kiting: !!kite, outrunnable, fastChasers, liveChasers, lineOnCorner, lineHere, kiteSpacing, contactGap: isFinite(contactGap) ? Math.round(contactGap) : null, kiteDamp: +kiteDamp.toFixed(2), kiteW: +kiteW.toFixed(3), kiteBuildShare: +kiteBuildShare.toFixed(2), flame: flameOn, hunger: +buildHunger.toFixed(2),
            toughness: +toughnessAvg.toFixed(2),
            passoutsNear: th.passouts.filter(po => Math.hypot(po.x - p.x, po.y - p.y) < 190).length,
            poCentroidDist: poN ? Math.round(Math.hypot(p.x - poCx, p.y - poCy)) : null,
            poNearest: poNearest == null ? null : Math.round(poNearest), ultFalloff: ultFall,
            ultInvuln, auraUlt, ultKind: charOf().ultKind || 'nuke',
            // nearest live (non-passout) body — how the ult gate decides
            // whether a spray/aura ult has anything to actually hit
            adjacent: th.enemies.reduce((m, e) => Math.min(m, Math.hypot(e.x - p.x, e.y - p.y) - (e.r || 0)), Infinity),
            poTtk: (poTtkOut == null || !isFinite(poTtkOut)) ? null : Math.round(poTtkOut),
            poDps: poDpsOut ? Math.round(poDpsOut) : 0, poGaveUp: poGiveUp.size,
            armorLv, armorConf: +armorConf.toFixed(2), holdoutAnchor,
            flameAim: flameTarget ? Math.round(flameTarget.d) : null,
            ultHarvest, ultInS: Math.round(ultInS), ultReadyNow,
            poField: th.passouts.length, poFree: th.passouts.reduce((n, po) => n + (po.contested ? 0 : 1), 0),
            kiteAt, fleeNear, contestTol: th.contestTol, trek: trekPo ? Math.round(Math.hypot(p.x - trekPo.x, p.y - trekPo.y)) : null,
            wallNear: th.enemies.some(e => e.wall && Math.hypot(e.x - p.x, e.y - p.y) < 190),
            bossNear: th.enemies.some(e => e.boss && !e.wall && Math.hypot(e.x - p.x, e.y - p.y) < 240),
            roamingBoss: th.enemies.some(e => e.boss && !e.wall && !e.stationary && Math.hypot(e.x - p.x, e.y - p.y) < 260),
            enemies: th.enemies.length, near: th.near, boss: th.boss,
            projectiles: th.projectiles.length, marks: th.marks.length,
            lines: th.lines.length, loot: loot.length,
            // v6.89.2: the POSTURE is now on the panel. The corner doctrine sat
            // behind a 150-minute gate no recorded run ever reached, and nothing
            // on screen said so — the only way to notice was to read the config.
            // A posture that cannot be observed cannot be tuned, so kite /
            // anchor / corner are reported live alongside the numbers.
            diag: `hp ${(hpRatio * 100).toFixed(0)}%${shieldMax ? '(+' + Math.round(shield) + 'sh)' : ''} | ${th.enemies.length}e ${th.projectiles.length}p ${th.marks.length}m ${loot.length}L | danger ${best.danger.toFixed(1)} | ${th.rival ? 'CHASE! ' : ''}${panic ? 'PANIC' : 'normal'}${depth > 0 ? ' | deep ' + Math.round(depth * 100) + '%' : ''} | ${parkOn ? (parked ? 'PARKED' : 'to-corner') : cornerOn ? 'CORNER' : (anchor ? 'ANCHOR' : (kite ? (kiteSpacing ? 'space' : 'kite') : 'free'))}${kiteSpacing && (cornerOn || anchor) ? '+space' : ''}`
        };
    }

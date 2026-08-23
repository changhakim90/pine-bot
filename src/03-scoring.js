
    // =================================================================
    // UPGRADE SCORING
    // =================================================================
    // SCORING PROFILE. 'crown-6.74' replays the level-up rules of the release
    // that actually won the hell crown; '6.79' plays the post-crown rules
    // (SUPER NEGRONI refused as a no-op, CAMPARI de-emphasised in hell,
    // slot-theft / craft-finish / plan-super bonuses). Both are tagged
    // separately in the version comparison, so the question "did the 6.79
    // scoring changes help or hurt?" gets answered by the snapshot table.
    const CROWN = CONFIG.scoringProfile === 'crown-6.74';

    function nameOf(card) {
        if (!card) return '';
        const raw = card.n || card.name || card.key || '';
        return String(raw).toUpperCase().replace(/\s+/g, ' ').trim();
    }
    function baseNameOf(card) {
        // strip a trailing "Lv3" / "LV 3" / "+1" decoration if present
        return nameOf(card).replace(/\s*(LV\.?\s*\d+|\+\d+)\s*$/i, '').trim();
    }
    function levelOf(card) {
        if (card && typeof card.lv === 'number') return card.lv;
        return ownedLevels[baseNameOf(card)] || 0;
    }
    function maxLevelOf(card) {
        if (card && typeof card.maxlv === 'number' && card.maxlv > 0) return card.maxlv;
        return ownedMax[baseNameOf(card)] || 6;
    }

    function unfinishedCocktails() {
        let n = 0;
        for (const c of COCKTAILS) {
            const lv = ownedLevels[c];
            if (lv != null && lv > 0 && lv < (ownedMax[c] || 6)) n++;
        }
        return n;
    }
    function isMaxed(name) {
        const lv = ownedLevels[name];
        return lv != null && lv >= (ownedMax[name] || 6);
    }

    function evolutionSynergy(name) {
        let bonus = 0;
        for (const evo of EVOLUTIONS) {
            if (!evo.parts.includes(name)) continue;
            const others = evo.parts.filter(p => p !== name);
            const ready = others.filter(isMaxed).length;
            if (ready === others.length) bonus += 30;          // this completes the craft
            else if (ready > 0) bonus += 10 * ready;
        }
        return bonus;
    }

    // Rainbow Gun math: it needs SIX super cocktails, and each super needs
    // base attack MAXED + that cocktail at Lv6 + its key ingredient MAXED.
    // So the strategy is a ROSTER, not a single build: finish cocktails one
    // after another, prefer ones whose key ingredient is already leveled
    // (GIN TONIC + VODKA TONIC share TONIC; COSMO + MARGARITA share ORANGE),
    // and treat the base attack as a must-max gate.
    function ownedCocktailCount() {
        let n = 0;
        for (const c of COCKTAILS) if ((ownedLevels[c] || 0) > 0) n++;
        return n;
    }
    // Deploy each PASSIVE for its intended purpose against the live field.
    function ingredientContextBonus(name) {
        const tags = INGREDIENT_TAGS[name] || [];
        let b = 0;
        if (tags.includes('dps')) b += Math.round(10 * dpsDeficit);              // losing the race: buy raw output
        if (tags.includes('dps') && passoutAvg > 1) b += 5;                      // DPS also cashes out passout loot faster
        if (tags.includes('pierce') && enemyMix.total > 12) b += 6;              // pierce cuts through mob lines
        if (tags.includes('shred') && (enemyMix.boss > 0.5 || hellDetected)) b += 6;  // CAMPARI: defense-down amplifies boss damage
        if (tags.includes('mobility') && (lastDeathCause === 'contact' || lastDeathCause === 'proj')) b += 5;
        if (tags.includes('regen') && lastDeathCause) b += 4;                    // dying at all: sustain helps
        if (tags.includes('economy') && dpsDeficit < 0.15 && gamePhase() !== 'early') b += 5;
        if (tags.includes('ult') && hellDetected) b += 4;                        // more invincibility uptime in hell
        return b;
    }

    // Match a weapon's REAL attack pattern (recipe book) to the current field.
    function enemyContextBonus(name) {
        const tags = WEAPON_TAGS[name] || [];
        let b = 0;
        const swarmHeavy = enemyMix.total > 12;
        const bossP = enemyMix.boss > 0.5 || hellDetected;
        if (swarmHeavy && tags.some(t => ['aoe', 'swarm', 'aura', 'orbit', 'line', 'zones', 'pierce', 'chain'].includes(t))) b += 8;
        if (bossP && tags.some(t => ['boss', 'sniper', 'homing', 'burst', 'tanky'].includes(t))) b += 8;
        if (bossP && tags.includes('knockback')) b += 5;
        if (lastDeathCause === 'contact' && tags.some(t => ['control', 'knockback', 'freeze', 'defense'].includes(t))) b += 6;
        return b;
    }

    // Deep-focus rule: while any owned cocktail is still below this level,
    // taking ANOTHER new cocktail splits our DPS and gets us killed early.
    function ownedCocktailBelow(lvl) {
        for (const c of COCKTAILS) {
            const l = ownedLevels[c] || 0;
            if (l > 0 && l < lvl) return true;
        }
        return false;
    }
    // Early game is about not dying: pump DPS into what we own before
    // spreading wide for the rainbow roster.
    function gamePhase() {
        const t = G.gameTime;
        if (typeof t !== 'number') return 'mid';
        return t < 360 ? 'early' : (t < 900 ? 'mid' : 'late');
    }

    function scoreCard(card, index, poolArr) {
        const type = String((card && card.type) || '').toLowerCase();
        const name = baseNameOf(card);
        // Does THIS pool offer a prescribed cocktail? Fallback substitutes
        // (off-plan cocktails whose super key is in our ingredient plan)
        // only earn their bonus when the answer is no — the user's rule:
        // "if the preferred cocktails are not available, pick the best next".
        const poolHasPlan = Array.isArray(poolArr) && poolArr.some(c =>
            String((c && c.type) || '').toLowerCase() === 'weapon' &&
            PLAN_COCKTAILS.includes(baseNameOf(c)));
        const lv = levelOf(card);
        const cap = maxLevelOf(card);
        const atCap = lv > 0 && lv >= cap;
        let score = 0;
        const why = [];
        const add = (v, tag) => { if (v) { score += v; why.push(tag + (v > 0 ? '+' : '') + v.toFixed(0) + ' '); } };

        switch (type) {
            case 'rainbowup': {
                // HARD LOCK (user): no Rainbow Gun in hell mode, ever —
                // regardless of slots, supers, or the learned policy.
                if (hellDetected) { add(-500, 'no-gun-in-hell'); break; }
                // USER-VERIFIED LIMITATION: the fresh Rainbow Gun is WEAK
                // compared to the six supers it replaces — taken at the first
                // opportunity it collapses the run's DPS and gets the bot
                // contact-killed. The window that works is the 25-30 MINUTE
                // mark (1500s+): the supers carry until then, the gun scales
                // after. Before the window the card scores below the re-roll
                // threshold, so weak pools get re-rolled instead of pulling
                // the trigger early.
                const gtNow = typeof G.gameTime === 'number' ? G.gameTime : 0;
                if (!rainbowChoice) rainbowChoice = chooseRainbowPolicy();
                // v6.85.21 (user: "rainbowgun is still appearing"). Skip
                // scored the gun at 18 — a REFUSAL that outbid every avoided
                // filler (they score negative) and every weak card under 18.
                // In a bad pool with no re-rolls left, 18 won and the bot
                // took the gun against its own policy. A skip is now a hard
                // veto (-500): the gun loses to literally anything else the
                // pool offers, and only an all-rainbow pool can force it.
                if (rainbowChoice !== 'take') { add(-500, 'no-gun-skip-policy'); break; }
                if (gtNow >= CONFIG.strategy.rainbowReadyS) add(400, 'RAINBOW');
                else add(18, 'rainbow-too-early');   // take policy: wait for the 25-min window
                break;
            }
            case 'rbstat': add(220, 'rainbow-stat'); break;
            case 'evolve': add(300, 'evolve'); break;
            case 'super':
                add(260, 'super');
                // v6.86.4: the +120 first-super premium is RETRACTED. The
                // manual Pat demo reached 19:42 with its FIRST super at 16:49
                // (3 by the end) — the human's order is armour, then the
                // ultimate, and supers arrive late on their own. Rushing one
                // would have cost the OLIVE 6 / NEGRONI 5 / ULT lv5 spine
                // that actually carried the run.
                if (charOf().style === 'tank' && supersThisRun === 0) add(20, 'tank-first-super');
                break;
            case 'ult':
                // USER DIRECTIVE: the ULTIMATE is the highest-priority pick —
                // it single-handedly clears passout fields, and maxed by ~20
                // min it deletes the boss ladder. Only the gun outranks it.
                add(320, 'ultimate');
                if (CONFIG.userRoadmap) add(20, 'user-build');
                // v6.86.4/5: for a TANK the ultimate is the whole passout
                // economy — two manual demos cleared 41 and ~20 bodies with
                // nothing else touching them. Each level doubles the spiral
                // (dmg*9.6*2^(lv-1)), and the premium runs to the CAP: demo 2
                // reached lv6 by 14:52 and its casts wiped million-HP fields
                // outright (3->0, 4->0), where its own lv1-lv3 casts had only
                // chipped a field of 3 down to 1.
                if (charOf().style === 'tank') {
                    const ulv = safe(() => player.ultLevel, 1) || 1;
                    if (ulv < 6) add(40, 'tank-ult-spine');
                }
                break;
            case 'base':
                // USER DIRECTIVE (top of the roadmap): SHAKING levels gate
                // EVERY super at Lv6 — base attack and the ultimate are the
                // top-priority picks whenever offered, above regular roster
                // cocktails/ingredients (only super/evolve/rainbow outrank).
                {
                    // "ALWAYS pick SHAKING UP or the ultimate when available"
                    // (user) — base sits directly under the ult, above evolves.
                    // MINGUK EXCEPTION (user): on the stall doctrine the base
                    // attack is not the damage engine, so it yields when the
                    // same pool offers a craft FINISH (a fusion that frees an
                    // ingredient slot) or the key that unlocks SUPER SOUTH SIDE.
                    let baseScore = 310;
                    if (CONFIG.rainbowPolicyOverride === 'skip' && Array.isArray(poolArr)) {
                        const yieldsTo = poolArr.some(c => {
                            const t2 = String((c && c.type) || '').toLowerCase();
                            const n2 = baseNameOf(c);
                            const clv = levelOf(c), ccap = maxLevelOf(c);
                            if (clv > 0 && ccap && clv >= ccap) return false;
                            if (isCraftFinish(t2, n2)) return true;
                            return t2 === 'passive' && n2 === 'MINT' &&
                                (ownedLevels['SOUTH SIDE'] || 0) >= (ownedMax['SOUTH SIDE'] || 6);
                        });
                        // the first 20 minutes are when ingredient space and
                        // craft timing actually decide the run (user)
                        const dayPhase = !hellDetected && (typeof G.gameTime !== 'number' || G.gameTime < 1200);
                        if (yieldsTo) baseScore = dayPhase ? 100 : 150;
                    }
                    add(atCap ? -40 : baseScore, 'base-attack');
                }
                if (!atCap && supersThisRun === 0 && ownedCocktailCount() >= 1) add(10, 'super-gate');
                break;
            case 'sp_firecross': add(70 + (hellDetected ? 15 : 0), 'firecross'); break;
            case 'sp_timestop': {
                // MINGUK DOCTRINE: time-pause extensions are the endgame
                // engine — every extra second is another window to melt a
                // paused boss with SOUTH SIDE. Maximize the count of these.
                const gtT = typeof G.gameTime === 'number' ? G.gameTime : 0;
                add(130 + (hellDetected ? 45 : (gtT > 1000 ? 25 : 0)), 'timestop');
                break;
            }
            case 'sp_tequila': add(65, 'tequila'); break;
            case 'gold': add(14, 'gold'); break;
            case 'gen': add(30, 'generator'); break;
            default: break;
        }

        // Enemy-adaptive bonuses: what we're actually fighting shapes what we
        // take. Heavy crowds make screen-wide specials worth more; a boss on
        // the field makes the ultimate worth more.
        if (type === 'sp_timestop' || type === 'sp_firecross')
            add(Math.round(30 * Math.min(1, enemyMix.total / 30)), 'crowd-adapt');
        if (type === 'ult' && enemyMix.boss > 0.5) add(40, 'boss-adapt');
        // Passouts keep spawning = loot piles waiting to be harvested — the
        // ultimate clears them wholesale (user strategy), and raw DPS cashes
        // them out too.
        // v6.85.10: the /3 ceiling meant a 20-passout floor scored identically
        // to a 3-passout floor — every passout-pressure signal in the scorer
        // saturates at 3, so the pick rules literally cannot see a backlog.
        // The ult is the designated passout clear (user), so it is the one that
        // should keep climbing with the pile.
        if (type === 'ult' && passoutAvg > 0.5) add(Math.round(10 + 22 * Math.min(1, passoutAvg / 8)), 'passout-farm');

        // The DPS race: enemies' HP and damage scale over the run. When our
        // measured kill rate falls behind the measured spawn pressure and
        // enemy toughness, shift picks hard toward damage and away from economy.
        const S = CONFIG.strategy;
        if (type === 'base' && !atCap) add(Math.round(0.8 * S.dpsDeficitGain * dpsDeficit), 'dps-race');
        if ((type === 'gold' || type === 'gen') && dpsDeficit > 0.2)
            add(-Math.round(15 * dpsDeficit), 'dps-first');
        // Economy mode: SALES is a scoring stat — but only farm it when
        // survival is secured (cruising, past the fragile early game).
        if ((type === 'gold' || type === 'gen') && dpsDeficit < 0.15 && gamePhase() !== 'early')
            add(10, 'economy-cruise');
        // CROWN ECONOMY: the ₩218.9M record is built on money multipliers.
        // Once the build is complete (6 supers or the Rainbow), gold and
        // generators become the primary scaling stat.
        if ((type === 'gold' || type === 'gen') && (rainbowThisRun || supersThisRun >= 6))
            add(25, 'crown-economy');

        const isCocktail = type === 'weapon' || COCKTAILS.includes(name);
        const isPassive = type === 'passive' || (!isCocktail && INGREDIENT_PRIORITY[name] != null);

        if (isCocktail && type !== 'evolve' && type !== 'super' && type !== 'rainbowup') {
            const phase = gamePhase();
            if (lv > 0 && !atCap) {
                // Owned: finishing a cocktail is a step toward its super — and
                // early on, leveling what we have is also the DPS that keeps
                // us alive. Progress compounds so near-done cocktails finish first.
                // (Maxed cards get NO progress bonus — they're dead picks.)
                {
                    const junkOwned = AVOID_COCKTAILS.has(name) && !PLAN_COCKTAILS.includes(name);
                    add(junkOwned ? Math.round((40 + lv * 6) * 0.2) : (40 + lv * 6), junkOwned ? 'progress(junk)' : 'progress');
                    // SUPER-SLOT THEFT (6.79): this banned cocktail's key is one
                    // of our own essentials, so maxing it WILL open a super and
                    // burn a slot the plan needs (MANHATTAN took NEGRONI's).
                    if (!CROWN && junkOwned && PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name]) &&
                        lv > 0 && lv < (cap || 6)) add(-45, 'slot-theft');
                }
                add(enemyContextBonus(name), 'enemy-adapt');
                if ((WEAPON_TAGS[name] || []).includes('defense'))
                    add(hellDetected ? 10 : (phase === 'early' ? 9 : 5), 'survival-kit');   // NEGRONI early = foundation
                // USER FORTRESS DOCTRINE: leveling NEGRONI's shield/dodge is
                // the early damage-reduction wall (with OLIVE) — never WATER
                if (name === 'NEGRONI' && phase === 'early' && !atCap) add(8, 'fortress');
                // SANDBOX LAB: NEGRONI's max-level shield BURNS (topped the
                // solo DPS table) and SOUTH SIDE is the bulk-clear king —
                // in a dense field, their levels are damage, not just utility.
                if (/^(NEGRONI|SOUTH SIDE)$/.test(name) && lv >= 3 && !atCap && enemyMix.total > 10)
                    add(6, 'lab-burn');
                if (phase === 'early') add(Math.round(CONFIG.strategy.earlyDps), 'early-dps');
                // minute-one sprint: the first attack upgrade must exist
                // before the first NO BOOKING wall (user directive)
                if ((typeof G.gameTime !== 'number' || G.gameTime < 120) && lv < 3) add(6, 'first-strike');
                add(Math.round(CONFIG.strategy.dpsDeficitGain * dpsDeficit), 'dps-race');
                if (enemyMix.boss > 0.5) add(8, 'boss-dps');   // boss on field: raw damage now
                const key = SUPER_KEY_INGREDIENT[name];
                if (key && isMaxed(key)) add(20, 'super-soon');
            } else if (lv === 0) {
                const S2 = CONFIG.strategy;
                if (ownedCocktailCount() === 0) {
                    // EARLY: the first weapon shapes the whole run — measured
                    // performance decides, with extra exploitation weight.
                    add(cocktailPriority(name) + 15, 'first-weapon');
                    if (PLAN_COCKTAILS.includes(name)) add(Math.round(S2.roadmapBonus), 'roadmap');
                    // substitute first pick with an in-plan super key (e.g.
                    // MOJITO when SUGAR is planned): rainbow potential intact
                    else if (!poolHasPlan && PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name])) add(10, 'plan-key-fallback');
                    add(buildUcb(name) * 1.5, 'build-history');
                } else {
                    let v = cocktailPriority(name) * 0.8;
                    // FALLBACK RAINBOW POTENTIAL: when the pool doesn't offer
                    // the prescribed build, prefer substitutes whose super key
                    // is ALREADY in our ingredient plan — a nearly-free extra
                    // super on the road to the gun.
                    if (!poolHasPlan && !PLAN_COCKTAILS.includes(name) && PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name]))
                        v += 10;
                    v += Math.round(enemyContextBonus(name) * 0.8);
                    if ((WEAPON_TAGS[name] || []).includes('defense'))
                        v += (hellDetected ? 8 : (phase === 'early' ? 7 : 4));   // NEGRONI early = foundation
                    if (PLAN_COCKTAILS.includes(name)) v += S2.roadmapBonus;   // on the rainbow roadmap
                    const key = SUPER_KEY_INGREDIENT[name];
                    const keyLv = ownedLevels[key] || 0;
                    if (keyLv > 0) v += 6 + keyLv * 2;       // its key ingredient is already invested
                    if (isMaxed(key)) v += 14;               // key done — this super is close
                    v -= 6 * unfinishedCocktails();          // focus pressure, not a wall
                    if (phase === 'early' && unfinishedCocktails() > 0) v -= 10;   // survive first, spread later
                    // LATE (day, not hell): a fresh Lv0 weapon can't reach Lv6
                    // before closing — dead weight unless its super is already
                    // one key away. In hell, levels flow fast; no penalty.
                    if (phase === 'late' && !hellDetected && !isMaxed(key)) v -= 14;
                    if (ownedCocktailBelow(S2.deepFocusLv))
                        v -= S2.expandPenalty * (PLAN_COCKTAILS.includes(name) ? 0.35 : 1);   // DEEP FOCUS — but the prescribed six must still arrive
                    // ROSTER-FILL (live audit: min 18, only 3/6 cocktails, one
                    // super): six supers need six cocktails EARLY. Pressure to
                    // complete the prescribed roster grows with the clock.
                    if (PLAN_COCKTAILS.includes(name) && ownedCocktailCount() < PLAN_COCKTAILS.length) {
                        const gtR = typeof G.gameTime === 'number' ? G.gameTime : 0;
                        v += Math.min(22, 6 + Math.round(gtR / 90));
                    }
                    add(v, 'new-cocktail');
                    add(buildUcb(name), 'build-history');    // learned: which cocktails win runs
                }
            }
        } else if (isPassive) {
            add(ingredientPriority(name), 'ingredient');
            add(ingredientContextBonus(name), 'purpose');
            add(evolutionSynergy(name), 'craft-synergy');
            if (name === 'ANGOSTURA' && (rainbowThisRun || supersThisRun >= 6)) add(12, 'crown-economy');
            if (name === 'TOMATO JUICE' && hellDetected) add(6, 'ult-uptime');
            // COFFEE BEANS = the revive. Wasted early (a fresh run costs
            // nothing), precious late/hell where one death ends a crown bid.
            if (name === 'COFFEE BEANS') {
                const ph = gamePhase();
                add(ph === 'early' ? -6 : (ph === 'mid' ? 6 : 14), 'revive-timing');
                if (hellDetected) add(8, 'revive-hell');
            }
            // key-ingredient value: every owned cocktail waiting on this ingredient
            let kv = 0;
            for (const ck of COCKTAILS) {
                if (SUPER_KEY_INGREDIENT[ck] !== name) continue;
                const cklv = ownedLevels[ck] || 0;
                if (cklv > 0) kv += 10 + cklv * 3;
                if (cklv >= (ownedMax[ck] || 6)) kv += 22;   // cocktail done → maxing this unlocks its super
            }
            add(kv, 'super-key');
            if (hellDetected && supersThisRun < 6 && kv > 0) add(12, 'rainbow-rush');
            if ((enemyMix.boss > 0.5 || hellDetected || enemyMix.total > 12) && VERSATILE_INGREDIENTS.includes(name))
                add(8, 'versatile');   // MINT upgrades shred crowds and mobile bosses
            if (ITEM_FINDER_INGREDIENTS.includes(name)) add(6 + (hellDetected ? 4 : 0), 'item-finder');
            // (NEGRONI's matching fortress bonus lives in the weapon branch)
            // USER DIRECTIVE: OLIVE (armor x2) is the TOP priority pick of
            // the first phase — runs are dying early for lack of defense.
            // Applies once a weapon exists (something must still deal damage).
            if (name === 'OLIVE' && gamePhase() === 'early' && ownedCocktailCount() >= 1 && !isMaxed('OLIVE'))
                add(26, 'olive-first');
            // v6.86.2 (user: "that was a bad run as I didn't get olives
            // early"). For a TANK the armour lines are not just survival —
            // they are the licence for everything else the character does:
            // the caution discount, the holdout anchor, and standing in the
            // ult window all key off OLIVE + NEGRONI levels. Armour bought at
            // minute 2 compounds for the whole run; the same level at minute
            // 20 buys almost nothing. So the premium is largest at t=0 and
            // decays to nothing by the finale, and it spans the whole day
            // rather than stopping at the 'early' bucket's 6-minute edge.
            // v6.86.5: TOMATO JUICE cuts the ult cooldown (player.ultCdMul).
            // The two demos differ by exactly this: demo 1 took it four times
            // and fired every 75s; demo 2 skipped it and fired every 98s —
            // 14 casts versus 12 over the same 20 minutes. For a bartender
            // whose passout economy IS the ultimate, cooldown is throughput.
            if (charOf().style === 'tank' && name === 'TOMATO JUICE' && !atCap) add(14, 'tank-ult-cadence');
            if (charOf().style === 'tank' && (name === 'OLIVE' || name === 'NEGRONI') && !atCap) {
                const gtA = typeof G.gameTime === 'number' ? G.gameTime : 0;
                const decay = Math.max(0, 1 - gtA / 1200);
                if (decay > 0) add(Math.round(30 * decay), 'tank-armor-early');
            }
            if (SURVIVAL_INGREDIENTS.includes(name)) {
                let sb = 10;
                // SOURCE-VERIFIED SCALING: enemy hp/dmg grow CONTINUOUSLY
                // with gameTime (gameTime/60, /90, /180 factors; NO BOOKING
                // walls at 42x base hp) — the defense the build needs is a
                // function of the clock. When armor/HP levels fall behind
                // the minute hand, survival picks jump the queue.
                const gtd = typeof G.gameTime === 'number' ? G.gameTime : 0;
                const defLv = (ownedLevels['OLIVE'] || 0) + (ownedLevels['SWEET VERMOUTH'] || 0) + (ownedLevels['NEGRONI'] || 0);
                if (defLv < Math.min(12, Math.floor(gtd / 120))) sb += 12;   // behind the curve
                // USER STRATEGY: early mob damage is LOW — armor/HP bought now
                // is cheap to establish and compounds for the whole run.
                // Foundation first, DPS second.
                if (gamePhase() === 'early') sb += 12;
                else sb += 8;                                          // defense still compounds later
                if (hellDetected) sb += 10;                            // hell: armor is king
                if (lastDeathCause === 'contact' || lastDeathCause === 'proj') sb += 8;   // dying to damage: buy armor
                add(sb, 'survival-kit');
            }
            // OLIVE IS THE SURVIVAL KING (user, restated): armor outranks
            // every other ingredient consideration — craft pressure, slot
            // pressure, drop rate, all of it. Nothing displaces it.
            // (gated on owning a weapon: armor on a bot that cannot kill
            // anything just delays the same death)
            if (name === 'OLIVE' && !atCap && ownedCocktailCount() >= 1) add(30, 'survival-king');

            // THE ESSENTIAL SIX (user, with their stated roles):
            //   TOMATO JUICE  ult cooldown  -> more invincibility windows
            //   SUGAR         item drop rate -> the consumable economy
            //   OLIVE         armor          -> raw survival
            //   CRANBERRY     pickup radius  -> drops reach us mid-rush
            //   SWEET VERMOUTH max HP        -> the buffer MINGUK lacks
            //   DRY VERMOUTH  crit + BLACK VERMOUTH craft -> frees a slot
            if (name === 'SWEET VERMOUTH' && !atCap)
                add(14 + (hellDetected ? 4 : 0), 'essential-hp');
            if (name === 'TOMATO JUICE' && !atCap)
                add(16 + (hellDetected ? 6 : 0) + (lastDeathCause === 'contact' || lastDeathCause === 'proj' ? 4 : 0), 'essential-ult');
            // DRY VERMOUTH: crit now, and fusing with SWEET frees a slot for
            // the ingredients the plan still needs.
            if (name === 'DRY VERMOUTH' && !atCap) add(12, 'essential-crit');
            // CRANBERRY (user-verified): expands the loot PICKUP RADIUS —
            // every kill pays more gold/XP with zero detour cost. Compounds
            // hardest when the field is rich with passout/wall loot.
            if ((INGREDIENT_TAGS[name] || []).includes('magnet'))
                add(6 + (passoutAvg > 1 ? 5 : 0) + Math.round(4 * dpsDeficit), 'loot-radius');
            // CRAFT PAIRS (user): SWEET+DRY VERMOUTH -> BLACK VERMOUTH and
            // SUGAR+WATER -> SIMPLE SYRUP. Each fusion consumes two slots and
            // returns one, freeing space for CAMPARI / TOMATO JUICE / the
            // rest of the essentials — so the nearer a pair is to completing,
            // the more urgent its remaining half becomes.
            if (!atCap) {
                for (const pair of CRAFT_PAIRS) {
                    if (!pair.includes(name)) continue;
                    const partner = pair[0] === name ? pair[1] : pair[0];
                    const pl = ownedLevels[partner] || 0;
                    if (pl <= 0) break;                      // partner not started: no craft pressure yet
                    const partnerCap = ownedMax[partner] || 6;
                    // slot pressure: a crowded ingredient bar makes fusing urgent
                    const slots = Object.keys(ownedLevels).filter(k => INGREDIENT_TAGS[k]).length;
                    const pressure = slots >= 8 ? 10 : slots >= 6 ? 5 : 0;
                    // partner already maxed = THIS card is the last step
                    if (pl >= partnerCap) {
                        // (6.79) a full bar makes the freed slot the point of the pick
                        const full = !CROWN && Object.keys(ownedLevels).filter(k => INGREDIENT_TAGS[k]).length >= 9;
                        add(26 + pressure + (full ? 14 : 0), 'craft-finish');
                    }
                    else add(8 + Math.round(pl * 2.5) + pressure, 'craft-pair');
                    break;
                }
                // SLOT ECONOMY: a craftable ingredient hands its slot back on
                // fusion; a terminal one holds it forever. When the bar is
                // filling — and especially during the first 20 minutes, when
                // the whole build still has to fit — a NEW terminal ingredient
                // pays a slot cost the craftable ones do not.
                {
                    const slots = Object.keys(ownedLevels).filter(k => INGREDIENT_TAGS[k]).length;
                    const craftable = CRAFT_PAIRS.some(pr => pr.includes(name));
                    const dayNow = !hellDetected && (typeof G.gameTime !== 'number' || G.gameTime < 1200);
                    if (lv === 0 && !craftable && slots >= 6 && !PLAN_INGREDIENTS.includes(name))
                        add(-(dayNow ? 12 : 8), 'slot-cost');
                }
            }
            // SUGAR: luck drives every consumable drop the stall build lives
            // on (time stops, flame crosses, tequila heals).
            if (name === 'SUGAR' && !atCap) add(16, 'drop-rate');
            // CRANBERRY: the pickup radius that makes those drops reachable
            // mid-rush — the other half of the same economy.
            if (name === 'CRANBERRY' && !atCap) add(14, 'pickup-radius');
            // CRANBERRY x SUGAR (user): cranberry's pickup radius hoovers the
            // tequila/heal drops that sugar's luck creates — during a mob
            // rush that pair IS the healing. Each amplifies the other.
            if (/^(CRANBERRY|SUGAR)$/.test(name) && !atCap) {
                const partnerLv = ownedLevels[name === 'CRANBERRY' ? 'SUGAR' : 'CRANBERRY'] || 0;
                add(8 + Math.min(8, partnerLv * 2) + (th_nearRef.v >= 5 ? 4 : 0), 'cranberry-sugar');
            }
            if (CROWN) {
                // CROWN RULES (6.74): CAMPARI's DOUBLE ROLE — shreds mob AND
                // boss defense, and it is SUPER NEGRONI's evolution key. With
                // NEGRONI in hand it advances both at once.
                if (name === 'CAMPARI' && (ownedLevels['NEGRONI'] || 0) > 0 && !atCap)
                    add(12, 'negroni-key-double');
            } else {
                // 6.79 RULES — CAMPARI, SOURCE-VERIFIED:
                //   player.enemyDefDown = pas.enemydef            (0.08 / level)
                //   player.campariR     = (110 + lv*16) * sizeMul * 0.6
                //   dealDmg: if dist(e, player) < campariR  ->  dmg *= 1 + enemyDefDown
                // A RADIUS-GATED flat damage multiplier: x1.48 at Lv6, inside
                // ~124px. DIFF() grows enemy HP x1.4 every 180s forever while
                // our damage is fixed — so x1.48 buys only ~3.5 minutes of kill
                // window. Worth a lot in the day, ~nothing in late hell where
                // its 124px payout radius sits INSIDE the giants' contact ring.
                if (name === 'CAMPARI' && !atCap) {
                    if (hellDetected) add(-6, 'campari-late-decay');
                    else add(12 + (th_nearRef.v >= 5 ? 4 : 0), 'campari-shred');
                }
            }
            if (PLAN_INGREDIENTS.includes(name)) add(Math.round(CONFIG.strategy.roadmapBonus * 0.8), 'roadmap');   // double-counts: super key + craft part
            if (name === 'ABSINTHE' && !(ownedLevels['CORPSE REVIVER No.2'] > 0)) add(-6, 'absinthe-trap');
        } else if (score === 0) {
            add(12, 'unknown');
        }

        // LINEBACKER COUNTER (user directive): while charge lanes are on the
        // field, homing and directed weapons — which track the charger even
        // off-screen — are the kill tools. Kiting keeps us alive; these kill.
        if (lastPlan && lastPlan.lines > 0 && (type === 'weapon' || type === 'super') && !atCap &&
            (WEAPON_TAGS[name] || []).some(t => ['homing', 'boss', 'sustained', 'sniper'].includes(t)))
            add(8, 'linebacker-counter');

        // SIEGE TOOLS (user directive): DIRECTED attacks — VODKA MARTINI's
        // gatling line above all, plus sniper/sustained patterns — are what
        // melt NO BOOKING walls and passout fields. When those targets are
        // on the field, directed weapons jump the queue. (Ultimates serve
        // the same purpose — handled in maybeAbilities: ult fires on walls,
        // bosses, and passout clusters when available.)
        const siegeField = (lastPlan && (lastPlan.wallNear === true || (lastPlan.passoutsNear || 0) >= 1)) || passoutAvg > 1;
        // USER: VODKA MARTINI + DRY MARTINI are the MAIN directed attacks on
        // passouts whenever the ultimate and flame cross aren't available.
        if (siegeField && (type === 'weapon' || type === 'super') && !atCap &&
            (/VODKA\s*MARTINI|DRY\s*MARTINI/i.test(name) || (WEAPON_TAGS[name] || []).some(t => ['sustained', 'sniper'].includes(t))))
            add(9, 'siege-tools');

        // USER PRIORITY ORDER: the two martinis lead the cocktail queue —
        // their directed/orbit fire is the passout-clearing backbone.
        if (type === 'weapon' && /^(VODKA|DRY)\s*MARTINI$/i.test(name) && PLAN_COCKTAILS.includes(name) && !atCap) add(8, 'martini-first');   // dormant unless the martinis are in the plan
        // USER EARLY DOCTRINE (live failure: early passives starved DPS and
        // passouts survived): weapons come FIRST in the early game. The ONLY
        // passives worth early slots are OLIVE > DRY VERMOUTH > SWEET
        // VERMOUTH, in that order — every other passive yields to any live
        // weapon/base/ult option in the same pool.
        if (type === 'passive' && gamePhase() === 'early') {
            // USER: OLIVE and NEGRONI are the best survival picks of the
            // first 20 minutes — armor and the dodge-shield are what carry a
            // thin MINGUK frame to the finale.
            // USER ORDER: OLIVE first for survival, then BOTH vermouths early
            // — fusing them into BLACK VERMOUTH frees the slot that SUGAR,
            // TOMATO JUICE and CAMPARI still need.
            if (name === 'OLIVE') add(20, 'early-rank-1');
            else if (name === 'DRY VERMOUTH') add(14, 'early-rank-2');
            else if (name === 'SWEET VERMOUTH') add(12, 'early-rank-3');
            else {
                const weaponAlt = Array.isArray(poolArr) && poolArr.some(c => {
                    const t = String((c && c.type) || '').toLowerCase();
                    if (!['weapon', 'base', 'ult'].includes(t)) return false;
                    const n = baseNameOf(c);
                    const clv = levelOf(c), ccap = maxLevelOf(c);
                    if (clv > 0 && ccap && clv >= ccap) return false;
                    return t !== 'weapon' || !AVOID_COCKTAILS.has(n);
                });
                if (weaponAlt) add(-14, 'weapons-first');
            }
        }

        // COCKTAILS-LEAN (user): between a roster cocktail and a key
        // ingredient in the same pool, the weight leans to the COCKTAIL —
        // except OLIVE, DRY VERMOUTH, SUGAR, and SWEET VERMOUTH, which keep
        // full weight (armor, crit, mojito key + luck, HP + the extra slot).
        if (type === 'passive' && !atCap &&
            !/^(OLIVE|DRY VERMOUTH|SUGAR|SWEET VERMOUTH)$/.test(name) &&
            Array.isArray(poolArr) && poolArr.some(c => {
                const t = String((c && c.type) || '').toLowerCase();
                const n = baseNameOf(c);
                const clv = levelOf(c), ccap = maxLevelOf(c);
                if (clv > 0 && ccap && clv >= ccap) return false;
                return t === 'weapon' && PLAN_COCKTAILS.includes(n);
            })) add(-8, 'cocktails-lean');

        // ROSTER-FIRST (user): a NEW roster cocktail in the level-up screen
        // outranks weapon-leveling — in EVERY phase, not just hell — unless
        // the pool's only alternatives are junk. New cocktails exist only
        // here; levels also flow from boss tips (especially in hell).
        if (ownedCocktailCount() < PLAN_COCKTAILS.length && type === 'weapon' && !atCap) {
            const rainbowPath = PLAN_COCKTAILS.includes(name) || PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name]);
            if (lv === 0 && rainbowPath && !AVOID_COCKTAILS.has(name)) add(hellDetected ? 30 : 24, 'roster-first');
            else if (lv > 0 && !/^★?\s*SUPER\b/i.test(name) &&
                Array.isArray(poolArr) && poolArr.some(c => {
                    const t = String((c && c.type) || '').toLowerCase();
                    const n = baseNameOf(c);
                    return t === 'weapon' && levelOf(c) === 0 && !AVOID_COCKTAILS.has(n) &&
                        (PLAN_COCKTAILS.includes(n) || PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[n]));
                })) add(-15, 'level-later');   // only when the pool actually OFFERS a new roster cocktail
        }

        // USER: NEGRONI is the LAST roster cocktail to JOIN in the first 20
        // minutes — damage cocktails first; the shield arrives by late day
        // (and hell-prep then rushes its super before the finale).
        if (type === 'weapon' && name === 'NEGRONI' && (ownedLevels[name] || 0) === 0 &&
            CONFIG.rainbowPolicyOverride !== 'skip' &&   // stall builds want the shield-burn ASAP
            ownedCocktailCount() >= 1 && !hellDetected &&
            (typeof G.gameTime !== 'number' || G.gameTime < 300)) add(-12, 'negroni-later');

        // USER OPENERS: VODKA MARTINI or MOJITO should be in hand EARLY —
        // their directed/sniper fire is what converts the first NO BOOKING
        // walls, bosses, and passouts into loot before the build matures.
        if (type === 'weapon' && /^(VODKA\s*MARTINI|MOJITO|SOUTH\s*SIDE|VODKA\s*TONIC)$/i.test(name) &&
            PLAN_COCKTAILS.includes(name) && !atCap &&
            gamePhase() === 'early' && (ownedLevels[name] || 0) === 0) add(14, 'opener');

        // MINGUK CORE (user): the stall build's pillars — maxed SOUTH SIDE
        // burn, NEGRONI shield-burn, OLIVE armor — take priority over the
        // rest of the roster.
        if (!atCap && ((type === 'weapon' && /^(SOUTH SIDE|NEGRONI)$/.test(name)) ||
            (type === 'passive' && /^(OLIVE|SWEET VERMOUTH|DRY VERMOUTH)$/.test(name)))) add(10, 'minguk-core');
        // v6.85.0 MITIGATION TILT: DIFF() proves damage is flat from minute 10,
        // so deep hell is won by HP, armor, shield and ult uptime. A tank
        // bartender leans harder into exactly those cards.
        if (charOf().mitigationTilt && !atCap && (
            (type === 'passive' && /^(OLIVE|SWEET VERMOUTH|TOMATO JUICE)$/.test(name)) ||
            (type === 'weapon' && name === 'NEGRONI') || type === 'ult'))
            add(charOf().mitigationTilt, 'tank-mitigation');
        // KNOCKBACK TO LEVEL 6 (v6.84.0 — the measured lever). VODKA CRANBERRY
        // and MOSCOW MULE gain their shove at Lv6 with NO super required, and
        // between them they are the primary of four of the all-time top runs
        // (255:48 included). Contact ends ~67% of runs, so a knockback
        // cocktail one or two levels short of 6 is the most valuable weapon
        // card on the board.
        if (type === 'weapon' && !atCap && /VODKA\s*CRANBERRY|MOSCOW\s*MULE/i.test(name) && lv >= 1 && lv < 6) {
            const near6 = lv >= 4 ? 14 : (lv >= 3 ? 8 : 4);   // closer to the shove = worth more
            const ctx = (hellDetected ? 10 : 0) +
                (lastDeathCause === 'contact' ? 8 : 0) +
                (enemyMix.boss > 0.5 ? 6 : 0);
            add(12 + near6 + ctx, 'knockback-to-6');
        }

        // WHISKY SOUR (user): the freeze beam pins bosses — a stopped boss
        // deals no contact damage, so it is a DEFENSIVE pick, valued higher
        // whenever bosses are the live threat.
        if (!atCap && /WHISKY\s*SOUR/i.test(name) &&
            (enemyMix.boss > 0.5 || hellDetected || (lastPlan && lastPlan.boss)))
            add(12, 'boss-freeze');

        // ABSOLUTE PRIORITY (user): SOUTH SIDE and MINT lead everything below
        // the ultimate and SHAKING UP — the burn engine and its super key.
        // USER: SOUTH SIDE is THE weapon — nothing but the ultimate and the
        // base attack outranks it (MINT rides with it as its super key).
        if (!atCap && /SOUTH\s*SIDE/i.test(name)) add(40, 'absolute-priority');
        if (!atCap && name === 'MINT') {
            add(24, 'absolute-priority');
            // CROWN RULES (6.74): SOUTH SIDE finished and only MINT stands
            // between us and its super — the single most valuable ingredient
            // state in the build.
            if (CROWN && (ownedLevels['SOUTH SIDE'] || 0) >= (ownedMax['SOUTH SIDE'] || 6)) add(20, 'unlocks-super-southside');
        }
        // (6.79) LAST STEP TO A PLAN SUPER: a finished plan cocktail waiting
        // only on this ingredient. Slots are capped at five, so every one
        // must go to a cocktail we actually chose (CAMPARI -> SUPER NEGRONI,
        // MINT -> SUPER SOUTH SIDE), never to a banned line.
        if (!CROWN && type === 'passive' && !atCap && PLAN_INGREDIENTS.includes(name)) {
            for (const ck of PLAN_COCKTAILS) {
                if (SUPER_KEY_INGREDIENT[ck] !== name) continue;
                if ((ownedLevels[ck] || 0) >= (ownedMax[ck] || 6)) { add(26, 'unlocks-plan-super'); break; }
                if ((ownedLevels[ck] || 0) >= 4) { add(12, 'plan-super-soon'); break; }
            }
        }
        // (v6.82.0's fifth-super bonuses removed in v6.84.0 — 112 runs showed
        // supersPerRun unmoved at 1.4-1.6 and the two best runs ever finishing
        // with THREE supers. Super COUNT does not produce depth; see the
        // knockback rule above, which is what the top runs actually share.)
        // survival pair, day phase: armor + shield before anything optional
        if (!atCap && !hellDetected && (typeof G.gameTime !== 'number' || G.gameTime < 1200) &&
            (name === 'OLIVE' || name === 'NEGRONI')) add(14, 'survival-pair');
        // ENDGAME ENGINE (user): SOUTH SIDE is what kills paused bosses —
        // late day and all of hell, its levels/super/key outrank the rest.
        if (!atCap && (hellDetected || (typeof G.gameTime === 'number' && G.gameTime > 900)) &&
            (/SOUTH\s*SIDE/i.test(name) || name === 'MINT')) add(16, 'endgame-southside');

        // SPAWN-PREP (source timetable): a boss class unlocks within 35s —
        // boss-purpose weapons and raw damage jump the queue NOW.
        if (upcomingBossUnlock()) {
            if (type === 'weapon' && (WEAPON_TAGS[name] || []).some(t => ['boss', 'sniper', 'homing', 'burst'].includes(t)) && !atCap)
                add(8, 'spawn-prep');
            if (type === 'passive' && (INGREDIENT_TAGS[name] || []).includes('dps') && !atCap)
                add(6, 'spawn-prep');
        }

        if (CROWN) {
            // CROWN RULES (6.74) — HELL PREP: NEGRONI must be a SUPER cocktail
            // before the finale — the hell boss rush shreds unprepared builds
            // (observed: a 0-super hell entry died in 50s). From mid-day on,
            // if SUPER NEGRONI doesn't exist yet, everything on its path jumps
            // the queue: NEGRONI levels, CAMPARI (its key), and the super card.
            if (!hellDetected && ![...supersMade].some(n => /NEGRONI/i.test(n)) && gamePhase() !== 'early') {
                if (type === 'weapon' && name === 'NEGRONI' && !atCap) add(14, 'hell-prep');
                if (type === 'passive' && name === 'CAMPARI' && !atCap) add(20, 'hell-prep');
                if (type === 'super' && /NEGRONI/i.test(name)) add(30, 'hell-prep');
            }
        } else {
            // 6.79 RULES — SOURCE-VERIFIED (read live from the game's
            // fireCocktail / recalcStats / hurtPlayer):
            //   * NEGRONI has NO projectile case at all — fireCocktail('negroni')
            //     falls straight through to break. The super multiplier P only
            //     exists inside fireCocktail, so EVOLVING NEGRONI CHANGES NOTHING.
            //   * Its whole effect is recalcStats:
            //       shieldMax = negLv > 0 ? round((20 + negLv*14) * 1.3) : 0
            //     driven by player.weapons.negroni ONLY — superLv is never read.
            //   * hurtPlayer: shieldMax > 0 gives a flat 8% total-negate roll, and
            //     any shield absorb sets invuln = 38 frames.
            // So a SUPER NEGRONI card is a pure no-op that ALSO burns one of the
            // five capped super slots and pushes the 6-super rainbow gate. Refuse
            // it outright. NEGRONI *levels* stay valuable (shield HP).
            if (type === 'super' && /NEGRONI/i.test(name)) add(-400, 'negroni-super-noop');
            if (!hellDetected && gamePhase() !== 'early') {
                if (type === 'weapon' && name === 'NEGRONI' && !atCap) add(14, 'hell-prep');
                // CAMPARI keeps its own merit (pas.enemydef) — no longer justified
                // as NEGRONI's evolution key, so the bonus is trimmed.
                if (type === 'passive' && name === 'CAMPARI' && !atCap) add(12, 'hell-prep');
            }
        }

    // Is this card the final step of a 2-part fusion (partner already maxed)?
    function isCraftFinish(type, name) {
        if (type !== 'passive') return false;
        for (const pair of CRAFT_PAIRS) {
            if (!pair.includes(name)) continue;
            const partner = pair[0] === name ? pair[1] : pair[0];
            const pl = ownedLevels[partner] || 0;
            if (pl > 0 && pl >= (ownedMax[partner] || 6)) return true;
        }
        return false;
    }

    // live super count straight from the game (superLv keys with any level)
    function liveSuperCount() {
        try {
            const sl = G.player && G.player.superLv;
            if (!sl || typeof sl !== 'object') return supersMade.size;
            return Object.values(sl).filter(v => typeof v === 'number' && v > 0).length;
        } catch (e) { return supersMade.size; }
    }
    // Would taking THIS card open a new super line we don't already have?
    function opensNewSuperLine(type, name) {
        try {
            const sl = (G.player && G.player.superLv) || {};
            const has = c => {
                const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                return Object.keys(sl).some(s2 => s2.toLowerCase().replace(/[^a-z0-9]/g, '') === k && sl[s2] > 0);
            };
            if (type === 'weapon') {
                if (!COCKTAILS.includes(name) || has(name)) return false;
                return isMaxed(SUPER_KEY_INGREDIENT[name]);          // key already maxed: this completes it
            }
            if (type === 'passive') {
                for (const c of COCKTAILS) {
                    if (SUPER_KEY_INGREDIENT[c] !== name) continue;
                    if (has(c)) continue;
                    if ((ownedLevels[c] || 0) >= (ownedMax[c] || 6)) return true;   // cocktail done, this key finishes it
                }
            }
        } catch (e) { }
        return false;
    }

    // GUN-GUARD (user: junk pool is free as long as no rainbow): the
        // gate is six MAXED supers — so the SIXTH super unlock card is the
        // one pick that can ever endanger the stall doctrine. At five
        // supers, any further super card is refused outright.
        {
            const nSupers = Math.max(supersMade.size, liveSuperCount());
            // the sixth super IS the gun — refuse the unlock card...
            if (type === 'super' && nSupers >= 5) add(-500, 'gun-guard');
            // ...and refuse anything that would OPEN a sixth line in the
            // first place (user: block it when picking weapons/ingredients).
            if (nSupers >= 5 && (type === 'weapon' || type === 'passive') &&
                opensNewSuperLine(type, name)) add(-500, 'gun-guard-source');
        }

        // KNOCKBACK+ZONE COMBO (user directive): SUPER VODKA CRANBERRY's
        // whip keeps bosses pinned inside SOUTH SIDE's burning ground — once
        // one half of the combo exists, the other half's cards jump in value.
        {
            const haveKb = [...supersMade].some(n => /VODKA\s*CRANBERRY/i.test(n));
            const haveZone = [...supersMade].some(n => /SOUTH\s*SIDE/i.test(n));
            if (!atCap && (type === 'weapon' || type === 'super' || type === 'passive')) {
                if (haveKb && /SOUTH\s*SIDE|MINT/i.test(name)) add(8, 'kb-zone-combo');
                if (haveZone && /VODKA\s*CRANBERRY|CRANBERRY/i.test(name)) add(8, 'kb-zone-combo');
            }
        }

        // RAINBOW RUSH: the goal is six super cocktails AS SOON AS POSSIBLE
        // once hell begins — every super card, super-level, and last-step key
        // ingredient gets priority toward the gun.
        if (type === 'super' && hellDetected) add(40, 'rainbow-rush');
        // SOURCE-INSPECTED (user bug report checked): the gun's real gate is
        // maxedSupers >= 6 — six supers EACH LEVELED TO 6, not six unlocks.
        // (No 7-cocktail requirement exists in the current build.) Leveling
        // existing supers IS the rainbow path — priority raised accordingly.
        if (/^★?\s*SUPER\b/i.test(name) && !atCap) {
            // whose super is this? strip the SUPER/UP decoration and match
            const bare = name.replace(/^★?\s*SUPER\s*/i, '').replace(/\s*UP$/i, '').trim();
            const bannedLine = AVOID_COCKTAILS.has(bare) && !PLAN_COCKTAILS.includes(bare);
            add(hellDetected ? 58 : 42, 'super-level');
            if (bannedLine) {
                // a banned line's super still beats junk, but never a plan super
                const planSuperInPool = Array.isArray(poolArr) && poolArr.some(c => {
                    const cn = baseNameOf(c);
                    if (cn === name) return false;
                    if (!/^★?\s*SUPER\b/i.test(cn)) return false;
                    const cb = cn.replace(/^★?\s*SUPER\s*/i, '').replace(/\s*UP$/i, '').trim();
                    return PLAN_COCKTAILS.includes(cb);
                });
                add(planSuperInPool ? -220 : -60, 'banned-super-line');
            }
        }   // in hell, LEVELING supers is the last gate before the gun
        // …and once the gun exists, EVOLVING it (rbstat) outranks everything —
        // the rainbow's growth curve is what carries the run to rank #1.
        if (type === 'rbstat' && rainbowThisRun) add(80, 'rainbow-evolve');

        if (card && card.isNew) add(6, 'new');
        if (atCap) add(-40, 'maxed');
        // audit fix: measured means used to count TWICE (priority tables AND
        // ucb both scale with the same mean) — that double vote is what kept
        // dragging picks toward off-plan measured favorites. Once an item has
        // real data (n>=3), the ucb term is halved to a tiebreaker.
        add(ucbScore(name) * (((learn.items[name] || {}).n || 0) >= 3 ? 0.5 : 1), 'ucb');
        add(ctxLearnBonus(name, pickContext()), 'ctx-learn');   // contextual bandit layer (LinUCB)

        // PLAN-FIRST DISCIPLINE (user): off-plan, un-owned cards yield to
        // live in-plan options in the same pool — a good measured mean
        // (COINTREAU, ORANGE) no longer outranks the prescribed roster.
        // Exempt: rainbow-path substitutes (super key already in the plan)
        // and passives that are the READY key of an owned cocktail.
        if ((type === 'weapon' || type === 'passive') && !atCap &&
            !(ownedLevels[name] > 0) &&
            !(type === 'weapon' && (PLAN_COCKTAILS.includes(name) || PLAN_INGREDIENTS.includes(SUPER_KEY_INGREDIENT[name]))) &&
            !(type === 'passive' && (PLAN_INGREDIENTS.includes(name) ||
                COCKTAILS.some(c => (ownedLevels[c] || 0) > 0 && SUPER_KEY_INGREDIENT[c] === name)))) {
            const gtP = typeof G.gameTime === 'number' ? G.gameTime : 0;
            const dayStrict = gtP < 1200 && !hellDetected;   // funding phase: zero wasted picks
            const planAlt = Array.isArray(poolArr) && poolArr.some(c => {
                const t = String((c && c.type) || '').toLowerCase();
                const n = baseNameOf(c);
                if (n === name) return false;
                const clv = levelOf(c), ccap = maxLevelOf(c);
                if (clv > 0 && ccap && clv >= ccap) return false;
                if (dayStrict && ['super', 'evolve', 'rainbowup', 'ult', 'base', 'rbstat'].includes(t)) return true;
                if (t === 'weapon') return PLAN_COCKTAILS.includes(n) || (dayStrict && (ownedLevels[n] || 0) > 0);
                if (t === 'passive') return PLAN_INGREDIENTS.includes(n) || (dayStrict && (ownedLevels[n] || 0) > 0);
                return false;
            });
            if (planAlt) add(dayStrict ? -30 : -14, 'off-plan');   // junk picks bury deeper in the funding phase (user)
        }

        // USER AVOID LIST: "ignore ... unless no other ingredients in the
        // priority roadmap appear". An avoided cocktail/passive that is NOT
        // in the active plan is buried whenever this pool offers any
        // non-avoided roadmap option — and scores normally (last resort)
        // when the pool has nothing from the roadmap.
        // RAINBOW CARDS ARE EXEMPT from every roster rule below (user: the
        // roster must never block the gun or its evolutions) — they exit
        // before any cap or penalty can touch them.
        if (type === 'rainbowup' || type === 'rbstat') {
            return { index, name, type, lv, cap, score, why: why.join('') };
        }
        // USER EXCEPTION: MOJITO/MANHATTAN are banned as gun risks — but if
        // taking one CANNOT open a new super line (its key is nowhere near
        // maxed, or its super already exists), the ban has nothing to protect
        // and the card may compete normally as a body.
        let gunRiskExempt = false;
        if (type === 'weapon' && /^(MOJITO|MANHATTAN)$/.test(name)) {
            const nS = Math.max(supersMade.size, liveSuperCount());
            gunRiskExempt = nS < 5 && !opensNewSuperLine('weapon', name) &&
                (ownedLevels[SUPER_KEY_INGREDIENT[name]] || 0) < 4;
        }
        let avoidJunk = false;
        if ((type === 'weapon' && AVOID_COCKTAILS.has(name) && !PLAN_COCKTAILS.includes(name) && !gunRiskExempt &&
                !((ownedLevels[name] || 0) > 0 && ownedCocktailCount() <= 1)) ||
            (type === 'passive' && AVOID_INGREDIENTS.has(name) && !PLAN_INGREDIENTS.includes(name))) {   // owned or not: junk never earns more levels while the plan wants them
            avoidJunk = true;
            // (owned WEAPONS are exempt: once committed — e.g. picked as a
            // sanctioned last resort — leveling the investment stays right)
            const poolHasRoadmapAlt = Array.isArray(poolArr) && poolArr.some(c => {
                const t = String((c && c.type) || '').toLowerCase();
                const n = baseNameOf(c);
                if (n === name) return false;
                if (['super', 'evolve', 'rainbowup', 'ult', 'rbstat'].includes(t)) return true;   // premium cards always beat avoided fillers
                const clv = levelOf(c), ccap = maxLevelOf(c);
                if (clv > 0 && ccap && clv >= ccap) return false;   // a MAXED card is a dead pick, not an alternative
                if (t === 'base') return true;
                if (t === 'weapon') return !AVOID_COCKTAILS.has(n) && (PLAN_COCKTAILS.includes(n) || (ownedLevels[n] || 0) > 0);
                if (t === 'passive') return !AVOID_INGREDIENTS.has(n) && (PLAN_INGREDIENTS.includes(n) || (ownedLevels[n] || 0) > 0);
                return false;
            });
            if (poolHasRoadmapAlt) add(-70, 'user-avoid');
        }
        // exception: with NO cocktail owned yet, an avoided weapon may still
        // be the only path to having a weapon at all — don't cap it then
        if (avoidJunk && type === 'weapon' && ownedCocktailCount() === 0) avoidJunk = false;

        // JUNK-CAP (user: TONIC still getting picked): an avoided item's
        // final score is clamped BELOW the re-roll threshold — measured
        // means and ucb can no longer float junk above a GINGER BEER re-roll.
        if (avoidJunk && score > (type === 'passive' ? 19 : 18)) {
            score = type === 'passive' ? 19 : 18;
            why.push('junk-cap ');
        }
        // SLOT BURN (live-diagnosed: junk passives filled every slot and
        // locked CAMPARI/TOMATO JUICE out of a 5-super run): a NEW banned
        // item costs a PERMANENT slot — capped below gold and consumables,
        // it is taken only when the pool holds literally nothing else.
        if (avoidJunk && lv === 0 && score > 8) { score = 8; why.push('slot-burn '); }
        // JUNK ORDERING (user): when a pool offers nothing but banned items,
        // they are not all equally worthless. COFFEE BEANS grants a REVIVE —
        // an extra life is worth more than any filler stat late in a run —
        // so it outranks COINTREAU and the rest of the junk from mid-game on.
        // (Applied after the caps so it orders within the junk tier only.)
        if (avoidJunk && type === 'passive' && !atCap) {
            const lateish = hellDetected || (typeof G.gameTime === 'number' && G.gameTime > 600);
            if (name === 'COFFEE BEANS' && lateish) {
                // (6.79) revive + longer freeze/slow/poison (source: edur -> durMul)
                const stallBuild = !CROWN && CONFIG.rainbowPolicyOverride === 'skip';
                add((hellDetected ? 10 : 6) + (stallBuild ? 8 : 0), stallBuild ? 'junk-order:revive+freeze' : 'junk-order:revive');
            }
            else if (name === 'COINTREAU') add(-2, 'junk-order:filler');
        }
        // v6.86.8 (user): "corpse reviver no. 2 and absinthe can't attack
        // marks, so they should be in the absolute junk pile". The CR line —
        // the cocktail and the ABSINTHE that keys it — cannot touch the
        // stationary targets the day is spent on, which the bot already knew
        // for its zombies ("can hit NEITHER passouts NOR no-booking walls").
        // Both are already avoid-listed, so they were capped like any junk;
        // this puts them at the BOTTOM of the junk tier, under COINTREAU and
        // well under COFFEE BEANS' revive, so a pool of nothing but junk
        // still picks something that can hit a holdout.
        if (avoidJunk && DEAD_VS_HOLDOUTS.has(name)) add(-12, 'junk-order:dead-vs-holdouts');
        // ...and once 8+ distinct passives are owned, ANY new off-plan
        // passive is slot-guarded — the remaining slots belong to the plan.
        if (type === 'passive' && lv === 0 && !PLAN_INGREDIENTS.includes(name) &&
            Object.keys(ownedLevels).filter(k => INGREDIENT_TAGS[k]).length >= 8 && score > 10) {
            score = 10; why.push('slot-guard ');
        }
        return { index, name, type, lv, cap, score, why: why.join('') };
    }

    function readPool() {
        try {
            const p = window._pool;
            if (Array.isArray(p) && p.length) return p;
        } catch (e) { }
        return null;
    }
    function poolSignature(pool) {
        try { return pool.map(c => nameOf(c) + ':' + (c && c.lv)).join('|'); }
        catch (e) { return String(Math.random()); }
    }
    function learnFromPool(pool) {
        for (const c of pool) {
            const n = baseNameOf(c);
            if (!n) continue;
            if (typeof c.lv === 'number') ownedLevels[n] = Math.max(ownedLevels[n] || 0, c.lv);
            if (typeof c.maxlv === 'number' && c.maxlv > 0) ownedMax[n] = c.maxlv;
        }
    }

    function handleLevelUp() {
        const pool = readPool();
        if (!pool) return false;
        const sig = poolSignature(pool);
        const now = Date.now();
        if (sig === lastPoolSig && now - lastPickAt < 900) return false; // already acted on this pool
        learnFromPool(pool);
        if (hellDetected) applyHellUnban();

        const scored = pool.map(scoreCard).sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (!best) return false;

        // GINGER BEER grants level-up RE-ROLLS (recipe book): if the whole
        // pool is weak, spend one instead of eating a dead pick. Once per pool.
        if (best.score < 22 && sig !== lastRerollSig) {
            const rr = findByText(/re-?roll/i);
            if (rr) {
                lastRerollSig = sig;
                clickEl(rr);
                setStatus('weak pool — re-rolled');
                return true;
            }
        }

        lastPoolSig = sig;
        lastPickAt = now;

        // Commit to a build the first time we take a cocktail.
        if (!primaryCocktail && COCKTAILS.includes(best.name)) primaryCocktail = best.name;
        ownedLevels[best.name] = Math.max(ownedLevels[best.name] || 0, (best.lv || 0) + 1);
        runPicks.push(best.name);
        runPickCounts[best.name] = (runPickCounts[best.name] || 0) + 1;
        runPickCtx.push({ name: best.name, x: pickContext() });   // LinUCB training example

        // Milestones (reward shaping): supers, crafts, and the Rainbow Gun.
        // SUPER UNLOCKS ONLY (v6.81.0): super-LEVEL cards share the type /
        // name shape, so the old ++ counted every level — long runs logged
        // 9-13 "supers" against a 5-super cap, over-crediting the milestone.
        // Key by the bare cocktail name; the count is the number of lines.
        if (best.type === 'super') {
            supersMade.add(best.name.replace(/^★?\s*SUPER\s*/i, '').replace(/\s*UP$/i, '').replace(/\s*(LV\.?\s*\d+|\+\d+)\s*$/i, '').trim() || best.name);
            supersThisRun = supersMade.size;
        }
        else if (best.type === 'evolve') craftsThisRun++;
        else if (best.type === 'rainbowup') { rainbowThisRun = true; rainbowAt = Date.now(); }

        pickAudit.push({
            gt: Math.round((typeof G.gameTime === 'number' ? G.gameTime : 0)),
            took: best.name, score: Math.round(best.score), why: best.why.trim(),
            over: scored.slice(1, 3).map(o => o.name + '=' + Math.round(o.score))
        });
        if (pickAudit.length > 14) pickAudit.shift();
        log('level-up:', scored.map(s => `${s.name}(${s.type})=${s.score.toFixed(0)}`).join('   '));
        setStatus('picked ' + best.name);

        lastLevelUpAt = Date.now();
        if (hasGame('pickUpgrade')) { callGame('pickUpgrade', best.index); return true; }
        return clickCardByIndex(best.index) || clickCardByName(best.name);
    }

    // =================================================================
    // DOM FALLBACKS (used only when the game API isn't reachable)
    // =================================================================
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    function inPanel(el) {
        try { return !!(el && el.closest && el.closest('#pineBotPanel, #pineBotReport')); }
        catch (e) { return false; }
    }
    function visible(el) {
        if (!el || inPanel(el)) return false;
        try {
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity || '1') < 0.05) return false;
            const r = el.getBoundingClientRect();
            return r.width > 2 && r.height > 2;
        } catch (e) { return false; }
    }
    function clickEl(el) {
        if (!el) return false;
        try {
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
            try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (e) { }
            el.dispatchEvent(new MouseEvent('mousedown', o));
            try { el.dispatchEvent(new PointerEvent('pointerup', o)); } catch (e) { }
            el.dispatchEvent(new MouseEvent('mouseup', o));
            el.dispatchEvent(new MouseEvent('click', o));
            if (typeof el.click === 'function') el.click();
            lastAction = 'click "' + String(el.textContent || '').trim().slice(0, 24) + '"';
            return true;
        } catch (e) { return false; }
    }
    function findByText(re) {
        const all = [...document.querySelectorAll('button, a, [role="button"], [onclick], .btn, div, span, li')];
        let best = null, bestLen = Infinity;
        for (const el of all) {
            if (!visible(el)) continue;
            const t = (el.textContent || '').trim();
            if (!t || t.length > 60 || !re.test(t)) continue;
            // Prefer the shortest text; on ties prefer the DEEPEST element
            // (a wrapper div and its button share the same text — the click
            // handler lives on the button, and events bubble up, not down).
            if (t.length < bestLen || (t.length === bestLen && best && best.contains(el))) {
                best = el; bestLen = t.length;
            }
        }
        return best;
    }
    function clickText(re) { return clickEl(findByText(re)); }

    function cardElements() {
        const sels = ['#levelCards > *', '.levelup .card', '.upgrade-card', '#upCards > *', '.cards > *', '.choice'];
        for (const s of sels) {
            let els = [];
            try { els = [...document.querySelectorAll(s)].filter(visible); } catch (e) { }
            if (els.length >= 2) return els;
        }
        return [];
    }
    function clickCardByIndex(i) {
        const els = cardElements();
        return els[i] ? clickEl(els[i]) : false;
    }
    function clickCardByName(name) {
        const n = norm(name);
        if (!n) return false;
        for (const el of cardElements()) if (norm(el.textContent).includes(n)) return clickEl(el);
        return clickText(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
    const NON_RENDERED = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
    function renderedTextOf(el) {
        // fallback for environments without innerText: textContent, minus scripts
        if (!el || NON_RENDERED[el.tagName] || el.id === 'pineBotPanel' || el.id === 'pineBotReport') return '';
        let t = '';
        for (const n of el.childNodes) {
            if (n.nodeType === 3) t += n.nodeValue;
            else if (n.nodeType === 1) t += ' ' + renderedTextOf(n);
        }
        return t;
    }
    function bodyText() {
        // IMPORTANT: never `innerText || textContent`. A <script>'s innerText is
        // '' (falsy), so that fallback dumped the game's entire source code into
        // the text — which contains the word HELL — causing false hell latches.
        try {
            let t = '';
            for (const el of document.body.children) {
                if (el.id === 'pineBotPanel' || el.id === 'pineBotReport') continue;
                if (NON_RENDERED[el.tagName]) continue;
                const it = el.innerText;
                t += ' ' + (it !== undefined ? it : renderedTextOf(el));
            }
            return t;
        } catch (e) { return ''; }
    }

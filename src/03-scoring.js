
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

    // v6.89.0 — THE ABSORBED-KEY BLIND SPOT.
    // isMaxed() answers "is this ingredient at Lv6 right now". For super
    // evolution that is the WRONG question, because a secret craft eats its
    // parts: once SWEET VERMOUTH + DRY VERMOUTH fuse into BLACK VERMOUTH both
    // halves leave ownedLevels, yet the game still treats their maxed keys as
    // satisfied. Every gun guard below is built on the key's level, so all of
    // them silently switched OFF the instant the craft the plan deliberately
    // pursues completed — and MANHATTAN, the cocktail that key unlocks, has
    // been showing up as a build for versions (6.85.5, 6.85.21, 6.86.1,
    // 6.86.10, 6.88.5). This is the question the guards should have asked.
    //
    // Three independent sources, cheapest first: the live level, the set we
    // record as levels land, and the craft's own result sitting in the bar.
    // The last one covers a craft that fused without a card we scored.
    function keyEffectivelyMaxed(key) {
        if (!key) return false;
        if (isMaxed(key)) return true;
        if (everMaxed.has(key)) return true;
        try {
            for (const evo of EVOLUTIONS) {
                if (!evo.parts.includes(key)) continue;
                if ((ownedLevels[evo.result] || 0) > 0) return true;
                const abs = G.player && G.player.absorbed;
                if (abs && (Array.isArray(abs) ? abs : Object.keys(abs))
                    .some(a => String(a).toUpperCase() === key)) return true;
            }
        } catch (e) { }
        return false;
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
        // v6.107.0 THE DEGREE OF CONTROL, against bosses (user: "gin and vodka
        // tonic slow the bosses, not exactly freeze"). A full freeze STOPS a
        // boss and a stopped boss deals no contact damage at all; a slow only
        // buys kiting room. Ranked, not equal — and mutually exclusive so a
        // card carrying both tags is paid once, at the higher rate.
        if (bossP && tags.includes('freeze')) b += 7;
        else if (bossP && tags.includes('slow')) b += 4;
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


    // v6.87.5: is a SUPER already qualified and just waiting for its trigger?
    // openRecipe(): "base attack MAX + cocktail Lv6 + key ingredient MAX ->
    // evolve at a BOSS TIP". Everything but the tip is inspectable, so this
    // answers "is there a super lying on the floor inside the next tip?".
    // Used by the loot valuer, which is why it lives at module scope.
    function evolutionPending() {
        try {
            const sl = (G.player && G.player.superLv) || {};
            const made = c => {
                const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                return Object.keys(sl).some(s2 => s2.toLowerCase().replace(/[^a-z0-9]/g, '') === k && sl[s2] > 0);
            };
            for (const c of COCKTAILS) {
                if (made(c)) continue;
                if ((ownedLevels[c] || 0) < (ownedMax[c] || 6)) continue;
                const key = SUPER_KEY_INGREDIENT[c];
                if (!key || (ownedLevels[key] || 0) < (ownedMax[key] || 6)) continue;
                return true;
            }
        } catch (e) { }
        return false;
    }

    // NOTE (v6.87.3): this lives ABOVE scoreCard deliberately. Its
    // neighbours — opensNewSuperLine, liveSuperCount, isCraftFinish — are
    // nested INSIDE scoreCard, which is invisible until something outside
    // tries to call them. handleLevelUp needs this one, so it belongs at
    // module scope.
    // v6.87.2 (user: "the bot needs to choose from the junk pool that doesn't
    // lead to the rainbow gun upgrade" + "cap the supercocktails to 5").
    //
    // opensNewSuperLine() above only fires on the LAST pick of a line — the
    // one where the other half is already maxed. That is too late to steer a
    // junk pool: the picks that actually walk the bot toward a sixth super are
    // the ordinary-looking ones several levels earlier. This returns how far
    // a card carries an OFF-PLAN line, 0 (cannot ever) .. 1 (completes it now),
    // so junk can be ORDERED by it instead of only vetoed at the end.
    //
    // Lines that can never complete score 0 and are not penalised: a key on
    // the permanent ban list (LEMON, ORANGE — neither is ever hell-unbanned)
    // means that super is unreachable no matter how many levels go in.
    function gunPathProgress(type, name) {
        try {
            const sl = (G.player && G.player.superLv) || {};
            const made = c => {
                const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                return Object.keys(sl).some(s2 => s2.toLowerCase().replace(/[^a-z0-9]/g, '') === k && sl[s2] > 0);
            };
            const NEVER_UNBANNED = new Set(['LEMON', 'ORANGE']);
            const cocktails = [];
            if (type === 'weapon' && COCKTAILS.includes(name)) cocktails.push(name);
            else if (type === 'passive') for (const c of COCKTAILS) if (SUPER_KEY_INGREDIENT[c] === name) cocktails.push(c);
            let worst = 0;
            for (const c of cocktails) {
                if (PLAN_COCKTAILS.includes(c)) continue;      // one of the sanctioned five
                if (made(c)) continue;                          // already a line we counted
                const key = SUPER_KEY_INGREDIENT[c];
                if (!key || NEVER_UNBANNED.has(key)) continue;  // unreachable line: harmless
                const cMax = ownedMax[c] || 6, kMax = ownedMax[key] || 6;
                const cLv = Math.min(cMax, (ownedLevels[c] || 0) + (type === 'weapon' ? 1 : 0));
                // v6.89.0: an ABSORBED key still counts (see keyEffectivelyMaxed).
                // Reading ownedLevels here scored a post-craft MANHATTAN line at
                // 0.5 risk when it was really 1 cocktail from a sixth super.
                const kLv = keyEffectivelyMaxed(key) ? kMax
                    : Math.min(kMax, (ownedLevels[key] || 0) + (type === 'passive' ? 1 : 0));
                worst = Math.max(worst, (cLv / cMax + kLv / kMax) / 2);
            }
            return worst;
        } catch (e) { return 0; }
    }

    // v6.88.5 LAST-RESORT CLAMP (user: "mule out unless it's the only option
    // that doesn't make a 6th cocktail"). A small positive bonus could not do
    // this: MOSCOW MULE still collected the generic cocktail credit
    // (progress+70, knockback-to-6+36 ...) and scored 111 against COFFEE BEANS'
    // 75 — the bot would have SOUGHT it. A last resort is defined by its
    // CEILING, not by a nudge.
    //
    // It has to be a wrapper rather than a line before the return, because
    // scoreCard has several exit points: clamping at one of them let the later
    // add() calls re-inflate the score right past it. Clamping outside catches
    // every path by construction.
    function scoreCard(card, index, poolArr) {
        const r = scoreCardInner(card, index, poolArr);
        if (!r || !LAST_RESORT.includes(r.name)) return r;
        const maxed = r.lv > 0 && r.cap && r.lv >= r.cap;
        if (!maxed && r.score > LAST_RESORT_CEILING) {
            r.why += 'last-resort-clamp' + Math.round(LAST_RESORT_CEILING - r.score) + ' ';
            r.score = LAST_RESORT_CEILING;
        }
        return r;
    }
    function scoreCardInner(card, index, poolArr) {
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
                // v6.86.9 (user): "rainbow gun should be explicitly banned
                // from being built — there's enough choices on the weapon and
                // ingredients roster to avoid that". The gun REPLACES the base
                // attack (`if(player.rainbow){ fireRainbow(); return; }`) and
                // a fresh one is weaker than the build it replaces, so runs
                // were ending shortly after it appeared. This is no longer a
                // learned policy or a timing window — it is a ban. Only a pool
                // with literally nothing else can force it.
                // v6.88.0 AUDIT D2: resolve the policy BEFORE the ban's break.
                // It used to sit one line after it, which made the only write
                // to `rainbowChoice` in the codebase unreachable — so it stayed
                // null and `stallMode` in the planner (05: rainbowChoice ===
                // 'skip' && hellDetected && !zoner) was permanently false. The
                // documented stall doctrine never engaged: a hell run at 60% HP
                // with no zoner still charged bosses. The gun stays banned;
                // only the bookkeeping moved above the break.
                if (!rainbowChoice) rainbowChoice = chooseRainbowPolicy();
                if (CONFIG.banRainbowGun) { add(-1000, 'gun-BANNED'); break; }
                const gtNow = typeof G.gameTime === 'number' ? G.gameTime : 0;
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
                // v6.88.3 — MEASURED, not doctrinal. The live 373-minute Pat
                // run (gt 22402, 121 minutes past the crown, 441/441 HP) reads
                // `timestopBonus: 162`. That is +162 SECONDS on every TIME STOP
                // pickup, roughly 81 stacked `+2s` picks, and it is the largest
                // number in the entire player object — larger than every damage
                // multiplier, every mitigation term, and every sustain source
                // combined. It also matches manual demo #3: 22 of 31 picks
                // after 26:00 were TIME STOP +2S.
                //
                // The corner and the ult chain keep you alive BETWEEN stops;
                // the stops are what make a 234-enemy field irrelevant. So this
                // is not one card type among several, it is the endgame engine,
                // and its value COMPOUNDS with depth rather than saturating.
                const gtT = typeof G.gameTime === 'number' ? G.gameTime : 0;
                let v = 130 + (hellDetected ? 45 : (gtT > 1000 ? 25 : 0));
                // past the deep-deep threshold nothing else on a card is worth
                // more; below it the old weighting stands unchanged.
                if (gtT > (CONFIG.deepHell.cornerAnchorFromS || 9000)) v += 90;
                // v6.110.0 — THE SWITCH IS THE MAXED ULT, NOT A CLOCK.
                // The joe recording is unambiguous: ULTIMATE UP at 1631, 1680
                // and 1740 taking the ult to lv6, and then TIME STOP +2S for
                // the next TWENTY picks without a single exception, from 1783
                // to 4482 — beating supers and evolves the whole way. frzShare
                // reaches 1.00 in deep and the field never moves again. The
                // pat 89-minute demo said the same (22 of 31 picks after
                // 26:00) and was filed as "confirmed, no scoring change made".
                // Two independent human recordings is no longer a coincidence.
                // Keyed on the ult being DONE rather than on gt, because that
                // is the transition the human actually plays: finish the
                // engine, then stack stops forever.
                else if (hellDetected && (safe(() => G.player.ultLevel, 0) || 0) >= 6) v += 90;
                else if (hellDetected && gtT > 2400) v += 40;
                add(v, 'timestop');
                break;
            }
            case 'sp_tequila': add(65, 'tequila'); break;
            case 'gold': add(14, 'gold'); break;
            case 'gen': add(30, 'generator'); break;
            default:
                // v6.88.1: an unrecognised type scores 0, and a pool of three
                // unknowns ties at 0 — the sort then hands the pick to card 0,
                // which is indistinguishable from a blind click. That is how
                // "clicking random items" would look if the game ever renamed
                // a type. It cannot be scored blind, but it must not be silent.
                if (type && !UNKNOWN_TYPES.has(type)) {
                    UNKNOWN_TYPES.add(type);
                    log('UNSCORED card type "' + type + '" (' + name + ') — picks in this family are arbitrary');
                }
                break;
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
            if (name === 'ABSINTHE' && !(ownedLevels['CORPSE REVIVER NO.2'] > 0)) add(-6, 'absinthe-trap');
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
        // v6.91.4 THE FREEZE IS WORTH WHAT IT IS SCARCE (user: "crucial when
        // time pause is not available"). The flat +12 could not move a pick: an
        // ingredient scores ~65 and a new cocktail opens around +12, so the
        // bonus was decorative in the exact regime the user is describing.
        //
        // Two multipliers, both keyed to that sentence:
        //   SCARCITY — measured pause uptime across this run's hell ticks. If the
        //     field is stopped often, TIME STOP is doing the job and WHISKY SOUR
        //     is redundant. `pauseShareRun()` is null before ~5s of hell samples,
        //     and null is treated as SCARCE on purpose: hell entry is where no
        //     evidence exists yet and where the user says the pick decides runs.
        //   PHASE — doubled through the hell-entry window. The median run is
        //     1325s against a 1200s entrance, so this is where runs are lost, and
        //     it is also where armour has not capped and a boss hit is lethal.
        // Hell-only for the same reason: the day has bosses, but not the ones
        // that one-hit a bot whose armour has not capped.
        if (!atCap && hellDetected && /WHISKY\s*SOUR/i.test(name)) {
            const shareW = pauseShareRun();
            const scarce = (shareW == null) ? 1 : Math.max(0, 1 - shareW);
            const gtW = typeof G.gameTime === 'number' ? G.gameTime : 0;
            const entryW = hellDetected && gtW < (CONFIG.deepHell.freezeEntryToS || 2400);
            add(Math.round(22 * (0.3 + 0.7 * scarce) * (entryW ? 2 : 1)), 'freeze-scarce');
        }

        // =============================================================
        // v6.88.4 PHASE ORDER (user: "the ordering of everything matters")
        // =============================================================
        // DAY: take the plan in the stated order, ingredients before cocktails.
        // The bonus is deliberately large — an ordering that has to argue with
        // the old weights is not an ordering. It decays 7 per rank so the list
        // is strictly monotonic, and it applies only while the plan is still
        // being assembled.
        const gtOrd = typeof G.gameTime === 'number' ? G.gameTime : 0;
        const dayBuild = !hellDetected && gtOrd < 1200;
        if (dayBuild && !atCap) {
            const rank = DAY_ORDER.indexOf(name);
            // FIRST ATTEMPT USED 130 - rank*7 AND DID NOT WORK: the residual
            // terms (super-line 54, boss-killer 50, progress 46, survival-kit
            // 30 ...) span ~150 points, so a 7-point step per rank was noise
            // against them and SOUTH SIDE came out 3rd instead of 12th. For an
            // ORDER to actually hold, the step between adjacent ranks must
            // exceed the whole spread of everything else. 200 does; anything
            // in the list therefore beats anything below it, always.
            // v6.88.6 — 200 PER RANK WAS WRONG, AND THE RUNS SAID SO.
            // It made the order lexicographic: nine ingredients had to reach
            // Lv6 before a single cocktail was taken (OLIVE lv5 scored 3722
            // against an unowned SOUTH SIDE at 1620), which is more picks than
            // a day contains. supersPerRun fell 1.9-2.1 -> 1.1 at n=10.
            //
            // Worse, it broke the SAFETY layer. gun-guard is -500 and the
            // rainbow ban is -1000; against a +3400 rank bonus both are noise,
            // so cards that open a sixth super line stopped being refused and
            // runs drifted toward the Rainbow Gun — which replaces the base
            // attack with something weaker and ends the run, especially with
            // NEGRONI's shield still unbuilt because it ranks 16th.
            //
            // An order has to be a strong PREFERENCE that loses to a veto, not
            // a priority that outranks one. Capped at 200 total so every guard
            // in the scorer still dominates it.
            if (rank >= 0) add(200 - rank * 11, 'day-order' + (rank + 1));
            // =========================================================
            // v6.107.0 THE ARMOUR TIER IS TIME-GATED
            // =========================================================
            // User's stated phasing, verbatim: "(1) Mojito, gin tonic, vodka
            // tonic, southside, ultimate, shaking up as the first picks for
            // damage to survive the initial 5 minutes. (2) olives, sweet
            // vermouth, sugar, negroni for armor in 5-10 minutes."
            //
            // The day order is STATIC — it reads the same at gt 0 as at gt
            // 1199 — so phase 2 did not exist. Scored against a fresh build at
            // 6.7 min the ranking came out ULTIMATE 785, STIRRING 531, OLIVE
            // 373, SOUTH SIDE 359: the armour anchor was the third pick of the
            // run and ahead of every cocktail, from second one.
            //
            // This is a SUPPRESSION with an expiry, not a reordering: before
            // `armorTierFromS` the armour ingredients give up part of their
            // rank bonus, and after it they get all of it back. Deliberately
            // NOT a veto — a pool that offers nothing else must still be
            // takeable, which is why it subtracts a bounded amount instead of
            // refusing the card.
            // 6.105.0's entry-armour checkpoint (+18 from 750s, +40 from
            // 1050s) is untouched and lands long after this expires, so
            // armour is still capped before the 1200s entrance.
            // (no `!hellDetected` here: the enclosing `dayBuild` guard is
            // already `!hellDetected && gtOrd < 1200`. Writing it again read
            // as a second safeguard and was dead code — teeth-verified by
            // deleting it and watching nothing fail. The hell exemption is
            // real, it just lives one block up, and `armor-tier` guards it
            // there as an invariant.)
            const armorFrom = CONFIG.movement.armorTierFromS;
            if (rank >= 0 && armorFrom != null && gtOrd < armorFrom &&
                ARMOR_TIER.has(name)) {
                add(-(CONFIG.movement.armorTierHold != null ? CONFIG.movement.armorTierHold : 60),
                    'armor-tier-hold');
            }
            // v6.88.6 SLOT LOCKOUT (user): "the choices become limited towards
            // building a rainbow gun as the game was designed that way ...
            // allowing the bot to fill the cocktail space earlier in the run
            // when choices aren't limited may be one way to permanently lock
            // out rainbow gun."
            //
            // This is the right shape of fix, and it is structural rather than
            // a veto. Late in a run the pool narrows until every cocktail on
            // offer walks a gun line — sometimes only two choices — so REFUSING
            // is not available by then. But a slot that is already occupied
            // cannot be filled by a card, so the gun line is closed by
            // OCCUPANCY instead of by scoring. The window to do that is early,
            // while the pool is still wide.
            //
            // So: until every plan cocktail is claimed (lv >= 1), an unclaimed
            // one outranks the whole ingredient order. Levelling can wait; the
            // slot cannot. Once all are claimed this term switches off and the
            // stated order governs again.
            const claimed = PLAN_COCKTAILS.filter(c => (ownedLevels[c] || 0) > 0).length;
            const slatFull = claimed >= PLAN_COCKTAILS.length;
            if (!slatFull && type === 'weapon' && lv === 0 && PLAN_COCKTAILS.includes(name)) {
                // v6.89.0 (user, on the two 6.88.6 runs that died at 596s and
                // 484s without reaching hell): +250 put an unclaimed cocktail
                // above the ENTIRE survival order — OLIVE, the vermouths, WATER
                // — so the early picks bought seven level-1 weapons and no
                // armour. The lockout is still right; its price was being paid
                // out of the day phase's survival budget.
                //
                // +60 keeps the claim ahead of levelling something already
                // claimed and ahead of every junk card, while OLIVE (200),
                // DRY VERMOUTH (189) and BLACK VERMOUTH (178) still outrank an
                // unclaimed SOUTH SIDE (112 + 60 = 172). The slots still fill
                // early — just not before the bot can survive to use them.
                add(60, 'slot-claim' + (claimed + 1) + '/' + PLAN_COCKTAILS.length);
            }
            // TWO THINGS SIT ABOVE THE WHOLE LIST, and both are the user's own
            // doctrine rather than an exception to it:
            //   the ULTIMATE — "ultimates used to kill passouts as priority for
            //     early loot and reward upgrades". The day IS the funding phase.
            //   SHAKING UP (base attack) — super evolution requires "base attack
            //     MAX + cocktail Lv6 + key ingredient MAX". Rank the base below
            //     seventeen other cards and NO super ever evolves, which would
            //     silently delete the four-line plan the order exists to build.
            if (type === 'ult') add(240, 'day-ult-first');
            else if (type === 'base') add(220, 'day-base-second');
            // v6.94.2 (user): "early upgrades to ultimate are key". The demo
            // digest shows why in numbers: pat's ult DOUBLES per level
            // (dmg*9.6*2^(lv-1)) while passout HP is priced at landing time —
            // lv2 arrived at gt 505 and by gt 600 the piles had outgrown the
            // cast (poHpAfter > poHpBefore from gt 656). At +240 the ult card
            // LOST to OLIVE (402) whenever both were offered. Until lv3 it
            // outranks everything; from lv3 the armor doctrine resumes.
            // v6.111.0 THE PREMIUM NOW REACHES LV6, where the evidence is.
            //
            // The old rule stopped dead at lv3 — "until lv3 it outranks
            // everything; from lv3 the armor doctrine resumes" — and the pat
            // demos measure the run's single biggest difference on the far
            // side of that line. Demos 1 and 2 are the same character, same
            // length, same day: demo 2 reached ult lv6 by 14:52 and wiped
            // million-HP passout fields outright (3->0, 4->0); demo 1 reached
            // lv5 at 18:17 and its lv1-3 casts only chipped fields of 3 down
            // to 1. Passouts piling to 24 on the floor was a SYMPTOM of the
            // low ult level, not a movement failure.
            //
            // And for the two invulnerability ults the level buys uptime
            // directly: joe's aura window is 8+0.8*(lv-1) s against a fixed
            // ULT_CD of 80 s, so lv1 -> lv6 is 10% -> 15% invulnerable, a 50%
            // increase in the only resource that makes standing in a crowd
            // survivable. Cadence cannot buy that — the bot is already firing
            // near cooldown (measured median inv 0.103 against a 0.10-0.15
            // ceiling). The window can.
            //
            // Entries 0-2 hold the old +200 exactly, so nothing below lv3
            // changes; the decaying tail is the new part, and it decays
            // because the armour doctrine it competes with is not wrong,
            // just not the whole story.
            if (type === 'ult') {
                const uLv = safe(() => player.ultLevel, 0) || 0;
                const sched = (CONFIG.abilities && Array.isArray(CONFIG.abilities.ultSpineByLv))
                    ? CONFIG.abilities.ultSpineByLv : [200, 200, 200];
                const bonus = uLv < sched.length ? sched[uLv] : 0;
                if (bonus > 0) add(bonus, 'ult-spine-lv' + uLv);
            }
        }
        // HELL: the plan is BUILT. The job is no longer to assemble it but to
        // avoid opening the six-maxed-super Rainbow Gun gate, so the safe junk
        // the user named becomes a real pick rather than a last resort.
        if (hellDetected && !atCap && HELL_SAFE_JUNK.includes(name)) {
            add(26, 'hell-safe-junk');
        }
        // v6.89.0 SURVIVAL CORE (user: "black vermouth and tomato juice are
        // also very important like olives", "especially when it reaches the 30
        // to 50 minute marks").
        //
        // This is a TIER above the day order, not a place in it. Demoting the
        // slot-claim to +60 was not enough on its own: an unclaimed SOUTH SIDE
        // still scored 359 against OLIVE's 322, because a cocktail collects
        // half a dozen other bonuses an ingredient never sees. The three cards
        // a run cannot survive without have to be lifted, not the cocktail
        // shaved — otherwise every future cocktail bonus quietly re-opens the
        // same hole.
        //
        // The 30-50 minute window (1800-3000s) is where the user watches runs
        // die: the tip window is closing, boss rings are widening, and a run
        // that is short an orbit or short ult uptime has no way back. The boost
        // roughly doubles there.
        if (!atCap && SURVIVAL_CORE.includes(name)) {
            const gtSc = typeof G.gameTime === 'number' ? G.gameTime : 0;
            const crunch = gtSc >= 1800 && gtSc <= 3000;
            add(crunch ? 150 : 80, crunch ? 'survival-core-crunch' : 'survival-core');
        }
        // MOSCOW MULE: off the plan, never sought, but safe to eat when the
        // pool offers nothing better. Its key (GINGER BEER) is banned for good
        // as of v6.88.5, so it cannot open a sixth super line no matter when it
        // is taken. Small and positive: it must lose to every planned card and
        // to the hell-safe junk, and beat only true junk.

        // =============================================================
        // v6.88.3 USER DOCTRINE, from the live 373-minute Pat run
        // =============================================================
        // Four super lines only (SOUTH SIDE / VODKA TONIC / GIN TONIC /
        // MOJITO). Everything below earns its slot on raw effect instead.
        //
        // "whisky sour, negroni, vodka cranberry should be massively boosted
        // despite not having super key" — all three sat at Lv6 in that run and
        // none of them supered. WHISKY SOUR's LEMON and NEGRONI's CAMPARI are
        // off-plan; VODKA CRANBERRY's key is planned as a STAT (pickup radius),
        // not as a super path.
        // v6.91.5: WHISKY SOUR joins this list on the same terms as NEGRONI —
        // no hell gate, because the freeze has to be IN HAND before the 1200s
        // entrance, and a hell-only boost would delay acquisition to exactly
        // after the point it is needed.
        //
        // RETRACTED MID-BUILD: I first restricted this to hell, on the reading
        // that the boost inverted the day order (WHISKY SOUR 201 vs VODKA TONIC
        // 172, NEGRONI 168). Those numbers came from the `freeze-slot` scenario,
        // whose env sets hell:true — they were never day numbers. In a real day
        // scene the order is SOUTH SIDE 359, NEGRONI 276, VODKA TONIC 263,
        // WHISKY SOUR 226: last among the planned cocktails, exactly as its
        // roadmap rank intends. There was no inversion to fix, and the "fix"
        // would have delayed the pick past the phase it exists for.
        if (!atCap && type === 'weapon' && KEYLESS_BOOST.includes(name)) {
            add(46 + (hellDetected ? 20 : 0), 'keyless-core');
        }
        // v6.95.2 ENTRY-REGEN CHECKPOINT: the proven deep seat runs on armor
        // AND regen (park gates on regenRate >= 1.0), but only armor had a
        // late-day checkpoint. If measured regen is behind by late day, WATER
        // (and the SIMPLE SYRUP it crafts into) jumps the queue so the park
        // gates pass at entry instead of forty minutes into hell.
        {
            const gtR = typeof G.gameTime === 'number' ? G.gameTime : 0;
            // ── v6.112.0 PRICED BY HP/s, AND AGAINST THE RIGHT BAR ─────────
            //
            // USER: "normal mob damage can be absorbed and countered with
            // simple syrup's healing regen rate." Two corrections follow.
            //
            // (1) THE BAR. The checkpoint fired while regen < 1.0, the old
            // park gate — which is BELOW break-even. At armour cap the
            // 38-frame invuln caps contact at 1.579 hits/s x 1 damage, so the
            // anchor needs 1.579 HP/s to hold. Stopping the checkpoint at 1.0
            // stopped it 0.58 HP/s short and handed the seat a build that
            // loses slowly. parkAudit's seated median regen is 1.42: the runs
            // that DID park were, at the median, still underwater.
            //
            // (2) THE INGREDIENT. Both cards paid a flat +16, and they are not
            // worth the same: SIMPLE SYRUP is 0.512 HP/s per level against
            // WATER's 0.284 — 1.8x. Joe has ZERO innate regen, so every point
            // comes from these two, and the difference is break-even at
            // SIMPLE SYRUP 4 versus WATER 6 (the entire cap, for less). The
            // bonus is now proportional to the HP/s the level actually buys.
            //
            // WATER keeps a real bonus rather than being demoted: it is half
            // of the SUGAR+WATER craft that MAKES simple syrup, so starving it
            // starves the better card. That is also why DAY_ORDER puts it at 8
            // and SIMPLE SYRUP at 9 — a prerequisite, not a preference.
            // ── v6.114.0 THE DAY IS AN HP ECONOMY, AND IT IS NEGATIVE ───────
            //
            // The first live 6.113.0 report carried the income audit, and its
            // first bucket settles what the day actually is:
            //
            //   0-10 min   loss 1.27/s   gain 1.00/s   net -0.27 HP/s
            //   10-20 min  loss 3.34/s   gain 2.57/s   net -0.77 HP/s
            //   20-30 min  loss 6.50/s   gain 5.02/s   net -1.48 HP/s
            //   firstNegativeMin: 20 (reported) — but bucket ZERO is already
            //   negative, and every bucket after it is too.
            //
            // Joe's pool is 100 HP. At -0.27 HP/s a full pool drains in 370 s,
            // and the day-death rows cluster at 360-1100 s. The day is not
            // being lost to a movement mistake; it is being lost to arithmetic.
            // The audit's own note says so: "no posture fixes that, only heal
            // income or time-stop uptime."
            //
            // One level of SIMPLE SYRUP is +0.512 HP/s and flips bucket zero
            // POSITIVE on its own. The checkpoint that buys it did not open
            // until gt 600 — i.e. after the entire first bucket had already
            // been spent bleeding. That gate is the bug.
            //
            // Two changes, and the second matters more than the first:
            //   1. Opens at `regenFromS` (120 s: after the first weapon, so the
            //      opening sprint still funds itself) instead of 600.
            //   2. The bonus is now proportional to the DEFICIT — how far below
            //      break-even the current regen is — rather than a flat +16
            //      that never came close to outbidding a base-attack card at
            //      560. At zero regen it pays `strategy.regenDeficit`, decaying
            //      to nothing as break-even is reached, so it stops bidding the
            //      moment the economy is solved rather than pouring the whole
            //      day into WATER.
            //
            // The size of that bonus is a genuine trade-off — every pick spent
            // on regen is a pick not spent on the super line, and supersPerRun
            // 0.5 against a supersMin of 3 is the OTHER binding constraint. I
            // do not know the right number, so it is a TUNABLE dimension and
            // the search settles it. That is the honest form of this change.
            const REGEN_PER_LV = { 'SIMPLE SYRUP': 0.512, 'WATER': 0.284 };
            const regenFromS = CONFIG.deepHell.regenFromS != null ? CONFIG.deepHell.regenFromS : 120;
            // ── v6.118.0 THE REGEN CARD WAS A BID, AND BIDS DO NOT WIN ────────
            //
            // USER, on a live minute-76 run: "the only issue is that it didn't
            // pick up water for hp regen and it will eventually die." The
            // manual digest of that run settles it beyond argument:
            //
            //     final: def 35, ultLv 6, supers 5, regen 0
            //     weapons: gintonic 6, olive 6, bloodymary 6, tonic 6,
            //              southside 6, dryver 6, negroni 6, cranberry 6,
            //              tomato 6, sugar 6, mojito 6, mint 6, sweetver 6,
            //              vodkatonic 6, moscowmule 6
            //     passives: {}
            //
            // FIFTEEN cards at level 6 and not one point of regen, at minute
            // 76. This is not the picker preferring something marginally
            // better — it is the regen card losing every single contest for
            // seventy-six minutes.
            //
            // Two reasons, both structural rather than a matter of degree:
            //
            //  1. THE BID WAS 16 POINTS. A weapon level-up scores progress+70
            //     and up. The project has now measured three times that a
            //     preference competing inside the gain sum does not move the
            //     bot (6.89.11's dormant pull, 6.107.0's drop anchor, the
            //     6.111.0 lane exit — "127 px in 120 minutes"). The deficit
            //     term that was supposed to carry it is `strategy.regenDeficit`,
            //     which the search has driven to a LIVE VALUE OF 0.
            //
            //  2. `!hellDetected` CLOSED IT AT HELL ENTRY. A run that reaches
            //     1200 s with zero regen can never fix it, no matter how many
            //     of the next 75 minutes it survives. The run above had 57
            //     minutes of hell and could not buy a single WATER.
            //
            // So regen stops being a bid and becomes a SPINE, the same shape as
            // `ult-spine`: while regen is below the seat's own floor
            // (deepHell.parkRegenRate), a regen card is a prerequisite and
            // outscores the roster. It decays to nothing the moment the floor
            // is met, so it cannot pour a whole run into WATER, and it pays
            // BOTH cards identically — DAY_ORDER still decides between them,
            // which is the 6.114.0 retraction and `slot-lockout` still holds it.
            //
            // And it runs in hell. That is the half that matters for a run
            // already at minute 76 with nothing.
            // ── v6.119.0 THE SPINE RUNS IN THE DAY TOO ────────────────────────
            //
            // 6.118.0 scoped it to hell because `slot-lockout` said WATER at 479
            // outranked every super key. That guard has now been revised to the
            // user's own doctrine (see DAY_ORDER in 01) — TONIC is demoted, MINT
            // leads — so the collision it was protecting no longer exists in the
            // form it was written for.
            //
            // And the hell-only scoping does not work, which the first batch
            // shows plainly. `regen` is now the LARGEST seat-miss bucket at 33%
            // (armour fell 20% -> 2% and yield 24% -> 6%, so this is what was
            // underneath), while entrySurvival is 0.40: SIXTY PERCENT of hell
            // entrants die within 300 s of the entrance. A spine that only opens
            // at hell entry has a couple of hundred seconds and one or two
            // level-ups to fix an economy the whole day was needed to build.
            // The rows say it did not: def 35 / regen 0 for 15,073 ticks,
            // def 23.3 / regen 0 for 1,414, def 35 / regen 0.57 for 4,084.
            //
            // So it opens at regenFromS (120 s) in both phases. The syrup guard
            // below still keeps the craft behind its halves.
            //
            // The historical note, kept because it is the reason this was ever
            // hell-only: the first draft reddened both guard invariants at once:
            //     {tonic:262, mint:278, sugar:273, dry:247, sweet:271, water:479}
            //     sugar 273  syrup 469
            // WATER at 479 outranks every super KEY, and SIMPLE SYRUP outranks
            // SUGAR — its own craft ingredient, which is the exact 6.112.0
            // mistake in a new costume. WATER already scores ~239 against a key
            // band of 247-278, so in the day there is no room for a premium at
            // all: anything above +8 breaks the super lines, and supersPerRun
            // 0.4 against a supersMin of 3 says those are not spare capacity.
            //
            // The user's reading — "water instead of tonic could have been a
            // better early pick" — is a real claim about the day, and it
            // collides head-on with that ordering. It is a trade-off, not a
            // bug, so it is not resolved here by fiat; the day keeps its
            // existing bid and the question goes back to the user.
            //
            // What IS unambiguous is hell. The reported run had FIVE supers and
            // fifteen cards at level 6 — the super lines were not the binding
            // constraint there, regen 0 was — and `!hellDetected` meant 57
            // minutes of hell could not buy a single WATER. That is the half
            // this ships.
            if (!atCap && type === 'passive' && REGEN_PER_LV[name] != null &&
                gtR >= regenFromS) {
                const floorR = CONFIG.deepHell.parkRegenRate != null ? CONFIG.deepHell.parkRegenRate : 1.0;
                const haveR = regenRate();
                // SIMPLE SYRUP is the WATER + SUGAR craft: it may only take the
                // spine once both halves are maxed and the craft is actually
                // available, or the premium walks it in front of its own
                // ingredients again.
                const syrupBlocked = name === 'SIMPLE SYRUP' &&
                    !((ownedLevels['WATER'] || 0) >= 6 && (ownedLevels['SUGAR'] || 0) >= 6);
                if (haveR < floorR && floorR > 0 && !syrupBlocked) {
                    const spine = (CONFIG.abilities && CONFIG.abilities.regenSpine != null)
                        ? CONFIG.abilities.regenSpine : 240;
                    const short = Math.max(0, Math.min(1, (floorR - haveR) / floorR));
                    add(Math.round(spine * short), 'regen-spine(' + Math.round(short * 100) + '%short)');
                }
            }
            if (!atCap && type === 'passive' && REGEN_PER_LV[name] != null &&
                !hellDetected && gtR >= regenFromS) {
                // null = armour unreadable; fall back to the old flat bar
                // rather than to a threshold nothing can meet.
                const be = contactBreakEven();
                const need = be == null ? 1.0 : be;
                const have = regenRate();
                if (have < need) {
                    // v6.114.0 RETRACTION. 6.112.0 scaled this by HP/s per
                    // level so SIMPLE SYRUP (0.512) outbid WATER (0.284)
                    // outright. That is right on regen arithmetic and WRONG on
                    // craft mechanics: SIMPLE SYRUP is the WATER + SUGAR craft,
                    // and DAY_ORDER deliberately ranks it after both halves
                    // (WATER 8, SUGAR 3). Opening the checkpoint at 120 s made
                    // the conflict live and `slot-lockout` caught it — the two
                    // cards came out 319 / 322, syrup ahead of its own
                    // ingredient. The per-level split is withdrawn; DAY_ORDER
                    // decides between the two regen cards, and the deficit term
                    // lifts BOTH equally. The user's point stands (syrup is the
                    // better regen source); it is expressed by the day order
                    // already putting them adjacent, not by outbidding the
                    // prerequisite.
                    const perLv = 16;
                    // ...and add the deficit term on top: full weight at zero
                    // regen, zero weight once break-even is reached.
                    const deficit = Math.max(0, Math.min(1, (need - have) / need));
                    const k = CONFIG.strategy.regenDeficit != null ? CONFIG.strategy.regenDeficit : 0;
                    add(perLv + Math.round(k * deficit),
                        'entry-regen-' + (name === 'SIMPLE SYRUP' ? 'syrup' : 'water') +
                        (deficit > 0 ? '(' + Math.round(deficit * 100) + '%short)' : ''));
                }
            }
            // v6.99.2 ENTRY-ARMOR CHECKPOINT (funnel n=240: 35 entrants, 31
            // dead in entry at median def 29.2 — the parkAudit seat bar is
            // 35). The fund rush buys tempo; from entryPrepFromS this
            // converts late-day picks back into the armor the seat needs.
            // 30 is the park gate the never-parked group sat just under.
            // v6.105.0 TWO TIERS, and the bar is now the CEILING not the
            // park gate. `< 30` worked only by coincidence (OLIVE 5 = 29.16
            // is under it, OLIVE 6 = 34.992 is over), which breaks the moment
            // any other armour source exists; 34.9 says what is meant. The
            // early tier is the real fix — see movement.entryArmorFromS.
            if (!atCap && name === 'OLIVE' && !hellDetected && (liveDefense() || 0) < 34.9) {
                if (gtR >= (CONFIG.movement.entryPrepFromS != null ? CONFIG.movement.entryPrepFromS : 1050)) {
                    add(40, 'entry-armor');
                } else if (gtR >= (CONFIG.movement.entryArmorFromS != null ? CONFIG.movement.entryArmorFromS : 750)) {
                    add(18, 'entry-armor-early');
                }
            }
        }
        // v6.95.1 (joe doctrine): joe has NO innate regen — NEGRONI's
        // regenerating shield is his regen substitute, and in the 6.94.1 pat
        // digest the roster's NEGRONI arrived at gt 752. Joe cannot wait 12
        // minutes for his only sustain. Joe-only, day-weighted.
        if (!atCap && type === 'weapon' && name === 'NEGRONI' && activeChar === 'joe' && !hellDetected) {
            add(26, 'joe-shield');
        }
        // v6.99.3 (user): "gin and tonic can attack passouts and should be
        // used as a boss killer since it slows the bosses from doing contact
        // damage." GIN TONIC was ranked purely as one of the four super
        // lines; its SLOW is a mitigation tool — a slowed boss lands fewer
        // contact ticks (contact is 66% of all HP ever lost), and the
        // projectile hits passouts. Day-weighted: the day boss roster is
        // where the slow buys the most (the demo's "full kill of day
        // bosses"); in hell the freeze tools (WHISKY SOUR, TIME STOP) own
        // that job.
        if (!atCap && type === 'weapon' && name === 'GIN TONIC') {
            add(!hellDetected ? 24 : 10, 'gin-boss-slow');
        }
        // v6.92.3 — THE MULE LOCKOUT (user, stating a game-design rule):
        // "a character cannot get moscow mule if the character has vodka cherry
        // and vice versa". The two are MUTUALLY EXCLUSIVE.
        //
        // That turns MOSCOW MULE from a neutral occupant into an active
        // DEFENCE. VODKA CRANBERRY is the most dangerous latent line on the
        // board — its super key CRANBERRY is a PLAN_INGREDIENT the build MUST
        // max for pickup radius, so unlike GIMLET or MANHATTAN its key is
        // armed by the plan's own success and the arming cap cannot touch it.
        // Taking the mule closes that line PERMANENTLY, by the game's own rule
        // rather than by our scoring winning a bidding war in a narrow pool.
        //
        // This is the rainbow-lockout doctrine exactly: occupancy beats
        // vetoing, and it only works while the pool is still wide. So the
        // bonus is DAY-weighted and switches off the moment either card is
        // owned — once the exclusion has resolved there is nothing left to buy.
        if (!atCap && type === 'weapon' && name === 'MOSCOW MULE' &&
            !(ownedLevels['MOSCOW MULE'] || 0) && !(ownedLevels['VODKA CRANBERRY'] || 0)) {
            add(hellDetected ? 18 : 45, 'mule-lockout');
        }
        // the four keyed lines sit ABOVE the keyless three by construction
        if (!atCap && type === 'weapon' && SUPER_LINE_COCKTAILS.includes(name)) {
            add(54 + (hellDetected ? 20 : 0), 'super-line');
        }
        // "olive, black vermouth, and simple syrup is now a top priority",
        // "along with tomato juice", "cranberry as well", "mint as well".
        // OLIVE is armour; TOMATO JUICE is ult throughput (demo 1: taken 4x,
        // cast every 75 s vs 98 s without); CRANBERRY is the pickup radius that
        // makes drops reachable while anchored; MINT is move speed AND the
        // mark-escape margin. The two crafts are pure upside — applyCraft keeps
        // the materials at full level with their stats still applying and only
        // frees the slot count.
        // ── v6.119.0 A CRAFT RESULT DOES NOT COLLECT THIS UNTIL IT IS REAL ──
        //
        // Both craft RESULTS (BLACK VERMOUTH, SIMPLE SYRUP) are on this list and
        // none of their four halves are, so the result collected +38 that its own
        // ingredients did not. The old day order hid that behind six ranks of
        // separation (SUGAR 3 vs SIMPLE SYRUP 9 = 66 points at the 11-per-rank
        // step, comfortably over the 38). The 6.119.0 re-rank puts them two
        // ranks apart — 22 against 38 — and `slot-lockout` caught it instantly:
        //
        //     sugar 273   syrup 273
        //
        // A TIE with its own ingredient, which is the 6.112.0 mistake yet again,
        // and the third distinct route into it. Rather than re-tune the ranks
        // until the arithmetic happens to work, remove the cause: a craft result
        // is not a "top ingredient" while it cannot be crafted. The bonus
        // arrives with the craft, and the halves lead until then — which is what
        // the comment above already claims ("a craft is only reachable if both
        // materials reach Lv6"). This holds under ANY future reorder.
        const craftUnmade = (() => {
            for (const c of EVOLUTIONS) {
                if (c.result !== name) continue;
                return c.parts.some(p => (ownedLevels[p] || 0) < 6);
            }
            return false;
        })();
        if (!atCap && type === 'passive' && TOP_INGREDIENTS.includes(name) && !craftUnmade) {
            add(38 + (hellDetected ? 14 : 0), 'top-ingredient');
        }
        // ...and the four halves that BECOME those crafts inherit the priority,
        // since a craft is only reachable if both materials reach Lv6.
        if (!atCap && type === 'passive' && CRAFT_HALVES.includes(name)) {
            add(34, 'craft-half');
        }
        // "lime, soda water can be junk pool picks": above true junk, below
        // anything planned. Only pays when the pool has nothing better.
        if (!atCap && JUNK_ACCEPTABLE.includes(name)) add(6, 'junk-acceptable');
        // "tonic can be priority if it helps in day phase" (user). It does, and
        // more than the phrasing suggests: TONIC is the SHARED key for two of
        // the four super lines (VODKA TONIC and GIN TONIC), so one ingredient
        // buys half the super plan. The boost is day-weighted because that is
        // when the lines are being assembled; in hell it reverts to its normal
        // plan value.
        if (!atCap && name === 'TONIC') {
            const gtTon = typeof G.gameTime === 'number' ? G.gameTime : 0;
            add((!hellDetected && gtTon < 1200) ? 32 : 12, 'tonic-two-lines');
        }

        // ABSOLUTE PRIORITY (user): SOUTH SIDE and MINT lead everything below
        // the ultimate and SHAKING UP — the burn engine and its super key.
        // USER: SOUTH SIDE is THE weapon — nothing but the ultimate and the
        // base attack outranks it (MINT rides with it as its super key).
        if (!atCap && /SOUTH\s*SIDE/i.test(name)) {
            add(40, 'absolute-priority');
            // v6.88.3 (user): "southside is essential to killing bosses". It is
            // the only body-centred burn zone in the plan, and the zone damage
            // predicate (hypot(e.x-z.x, e.y-z.y) < z.r + e.r) means it lands on
            // a boss's HITBOX circle rather than needing the centre — which is
            // why it works on paused bosses at a 150 px station where nothing
            // else reaches. Its lead over the keyless three must not be
            // marginal: the first measurement had it at 151 vs NEGRONI's 136.
            add(28 + (enemyMix.boss > 0.3 || (lastPlan && lastPlan.boss) ? 22 : 0), 'boss-killer');
        }
        if (!atCap && name === 'MINT') {
            add(24, 'absolute-priority');
            // v6.88.2 MARK ESCAPE (see MARK_CLEAR_PX in 01): a character whose
            // base speed cannot clear a 0.6 s / 70 px mark is buying survival
            // here, not mobility. Pat is 1.6 px short per frame; the runners
            // already clear it and get nothing. Scaled by how short they are,
            // so the rule stays honest if the character table ever changes.
            const spd = charOf().speed || 2.4;
            const shortfall = Math.max(0, MARK_CLEAR_PX - spd * MARK_TELE_FRAMES);
            if (shortfall > 0) {
                add(Math.min(30, Math.round(shortfall * 1.6)) + (hellDetected ? 8 : 0), 'mark-escape');
            }
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
            // v6.94.2 — THE 6.74 HELL-PREP BLOCK IS DEAD, and it was the gun
            // leak. It paid +14 NEGRONI / +20 CAMPARI / +30 for the SUPER
            // NEGRONI card — actively walking the line the whole lockout
            // doctrine forbids. This is HOW the live run evolved NEGRONI
            // (audit A2), and it is what the user was watching: "the bot
            // seems to be picking up upgrades for rainbow gun more often."
            // NEGRONI is a KEYLESS occupant by doctrine (its key CAMPARI is
            // arming-capped and avoid-listed since 6.92.0); the refusal that
            // guarded exactly this sat in the OTHER profile's dead branch.
            // Hoisted here so the live branch refuses it too.
            if (type === 'super' && /NEGRONI/i.test(name)) add(-400, 'negroni-super-noop');
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
    const CAP_LINES = () => CONFIG.maxSuperLines || 4;
    function opensNewSuperLine(type, name) {
        try {
            const sl = (G.player && G.player.superLv) || {};
            const has = c => {
                const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                return Object.keys(sl).some(s2 => s2.toLowerCase().replace(/[^a-z0-9]/g, '') === k && sl[s2] > 0);
            };
            if (type === 'weapon') {
                if (!COCKTAILS.includes(name) || has(name)) return false;
                return keyEffectivelyMaxed(SUPER_KEY_INGREDIENT[name]);   // key already maxed (or absorbed): this completes it
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
            const CAP = CAP_LINES();
            const nSupers = Math.max(supersMade.size, liveSuperCount());
            // the sixth super IS the gun — refuse the unlock card...
            if (type === 'super' && nSupers >= CAP) add(-500, 'gun-guard');
            // ...and refuse anything that would OPEN a sixth line in the
            // first place (user: block it when picking weapons/ingredients).
            if (nSupers >= CAP && (type === 'weapon' || type === 'passive') &&
                opensNewSuperLine(type, name)) add(-500, 'gun-guard-source');
            // v6.92.0 THE ARMING CAP — the CAMPARI/LIME hole, closed.
            // Both guards above are gated on `nSupers >= CAP`, so they say
            // nothing while the count is still climbing. That is exactly when
            // a junk key gets maxed: the live run read campari 6 / lime 6 with
            // GIMLET and NEGRONI already evolved and nSupers only at 5.
            // This fires at ANY super count, because arming a line the plan
            // never wanted is never right — and only on the final level, so
            // the junk tier keeps working up to Lv5.
            if (armsLineNow(type, name, lv, cap)) add(-700, 'arming-cap');
            // v6.89.0 LATENT LINE — the MANHATTAN hole, closed.
            // An off-plan cocktail whose super key is ALREADY satisfied (maxed,
            // or maxed-then-absorbed by a craft) is not a gun risk that grows
            // with picks: it is a sixth super line that needs nothing but
            // levels in the cocktail itself. The guards above only fire at the
            // cap or on the completing pick, both of which arrive too late —
            // by then the slot is spent and the pool has narrowed. Refuse it at
            // level ZERO, at any super count. Opening the line is the mistake;
            // everything after it is just paying for the mistake.
            //
            // -600 at lv 0 sits below the rainbow ban's own -500s, so a pool
            // offering nothing but latent lines still resolves rather than
            // deadlocking; -400 once it is already owned keeps feeding it worse
            // than eating junk, without pretending the slot can be un-spent.
            if (type === 'weapon' && COCKTAILS.includes(name) && !PLAN_COCKTAILS.includes(name)) {
                const lkey = SUPER_KEY_INGREDIENT[name];
                const sl2 = (G.player && G.player.superLv) || {};
                const k2 = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
                const already = Object.keys(sl2).some(s3 =>
                    s3.toLowerCase().replace(/[^a-z0-9]/g, '') === k2 && sl2[s3] > 0);
                // v6.89.1 — CAUGHT LIVE, AND 6.89.0 WOULD HAVE MISSED IT.
                // A 6.88.6 console log shows MANHATTAN taken at lv0 for a score
                // of 41 out of a junk pool (against ANGOSTURA 8, LEMON 8,
                // SIDECAR -22), levelled 114 -> 120 -> 126, and evolved:
                // "★ SUPER MANHATTAN UP(super)=338". The gun guard only woke up
                // afterwards, scoring the same card -322 once the line existed.
                //
                // 6.89.0 keyed the veto on the super key being ALREADY maxed.
                // At the moment that MANHATTAN was taken it was not — so the
                // veto stayed silent and the line opened anyway.
                //
                // The missing half: THE PLAN MAXES ITS OWN INGREDIENTS. SWEET
                // VERMOUTH is a craft half; BLACK VERMOUTH cannot be made
                // without taking it to Lv6. So MANHATTAN is a latent sixth line
                // from turn one, not from the moment the key tops out. Six
                // off-plan cocktails are latent by exactly this construction —
                // MANHATTAN (sweet vermouth), VODKA MARTINI (dry vermouth),
                // WHISKEY HIGHBALL (water), DRY MARTINI (olive), BLOODY MARY
                // (tomato juice), ESPRESSO MARTINI (coffee beans) — and the
                // measured rows are full of runs built on them.
                //
                // A cocktail keyed to an ingredient the plan intends to max is
                // a sixth super waiting for levels. Refuse it at level zero,
                // from the first pool, before the slot is spent.
                const planWillMax = lkey && PLAN_INGREDIENTS.includes(lkey);
                // =====================================================
                // v6.110.0 — THE VETO WAS FIRING AT ZERO SUPERS.
                // =====================================================
                // The user's own 79-minute joe recording took COSMOPOLITAN as
                // the FIRST pick of the run, VODKA CRANBERRY four times to
                // lv4 (gt 393/408/582/637), GIMLET at 1002 and VODKA MARTINI
                // at 1092 — and finished with FOUR supers, never near the gun.
                // Every one of those is refused here today: VODKA CRANBERRY's
                // key is CRANBERRY, which IS in PLAN_INGREDIENTS, so
                // `planWillMax` fires and the card scores -600 at lv0.
                //
                // The rule is right about the mechanism and wrong about WHEN.
                // A sixth line needs six MAXED supers. At gt 393 the human had
                // ZERO supers — the line was many picks away and the run
                // needed damage, which is what those cocktails are. 6.87.4
                // already recorded this once ("minguk's best recent runs are
                // built on exactly those — DRY MARTINI, VODKA CRANBERRY,
                // COSMOPOLITAN") and relaxed the gun-path tax below halfway;
                // 6.89.0 then re-refused the same cards from a different
                // direction, and nobody noticed the two rules disagreed.
                //
                // So the veto now waits until the super count is actually near
                // the cap. Below that the card is judged on merit. NOTHING at
                // the dangerous end changes: `gun-guard` (-500 on the sixth
                // super card), `gun-guard-source` (-500 on anything opening a
                // line at the cap), `arming-cap` (-700 on the key's final
                // level, at ANY count) and `gun-path-complete` (-500) all
                // still stand, and those are the guards that actually execute.
                // A LEVEL CEILING rides along as belt-and-braces: the human's
                // own ceiling was lv4, and a latent cocktail parked below
                // evolution range cannot become a super however the key moves.
                // THE LOAD-BEARING GUARD IS NOW THE LEVEL CEILING, and it is
                // strictly stronger than what it replaces. A super needs the
                // cocktail MAXED and its key maxed. The MANHATTAN incident
                // 6.89.0 was built on ran exactly that course: taken at lv0 out
                // of a junk pool, levelled 114 -> 120 -> 126, evolved. Capping
                // the cocktail below evolution range makes that course
                // impossible at ANY super count and however the key moves —
                // whereas the old lv0 veto only made it unlikely, and 6.87.4
                // had already relaxed a sibling rule for the same cards.
                // The old veto is KEPT at the dangerous end: near the cap the
                // card is refused at every level, exactly as before.
                const nearCap = nSupers >= CAP - 1;
                const lvlCeil = CONFIG.gunSafeOffPlanLv != null ? CONFIG.gunSafeOffPlanLv : 4;
                if (lkey && !already && (keyEffectivelyMaxed(lkey) || planWillMax)) {
                    if (nearCap) add(lv === 0 ? -600 : -400, planWillMax ? 'latent-line-planned' : 'latent-line');
                    else if ((lv || 0) >= lvlCeil) add(-600, 'latent-line-ceiling');
                }
            }
            // v6.89.0 SLOT WASTERS (user: old fashioned / corpse reviver out of
            // the junk pool). A cocktail slot is the lockout's currency; these
            // two buy nothing with it.
            if (type === 'weapon' && lv === 0 &&
                SLOT_WASTERS.includes(name) && !PLAN_COCKTAILS.includes(name)) {
                add(-300, 'slot-waster');
            }
            // v6.87.2: the same refusal one step earlier and independent of the
            // count — a card that COMPLETES a line outside the planned five is
            // a sixth line by construction, because the roster only ever holds
            // five. Waiting for nSupers to reach the cap let the pool hand us
            // the sixth line while we were still at four.
            if ((type === 'weapon' || type === 'passive') && !atCap) {
                const risk = gunPathProgress(type, name);
                if (risk >= 0.999) add(-500, 'gun-path-complete');
                // ...and BELOW that, ordering rather than vetoing. When the
                // pool is all junk the bot must still take something; it should
                // take the junk that does NOT walk toward the gate.
                //
                // v6.87.4 CORRECTION, from the first measured 6.87.3 runs:
                // supers/run fell 3.2 -> 0.5 and hell rate 1.0 -> 0.5 (n=5 and
                // n=4, so weak evidence, but the MECHANISM is not in doubt).
                // 6.87.2 taxed EVERY off-plan line from its very first level,
                // and minguk's best recent runs are built on exactly those —
                // DRY MARTINI, VODKA CRANBERRY, COSMOPOLITAN. Two levels in an
                // off-plan cocktail is damage, not a gun path: it cannot become
                // a super without many more picks, and the -500 above catches
                // the pick that would actually finish it.
                // So the tax now starts only past the HALFWAY mark, where a
                // line is genuinely in danger of completing, and climbs steeply
                // from there. Below half, off-plan cards are judged on merit.
                else if (risk > CONFIG.gunPathFloor) {
                    const t = (risk - CONFIG.gunPathFloor) / Math.max(1e-6, 1 - CONFIG.gunPathFloor);
                    add(-Math.round(6 + 60 * t), 'gun-path');
                }
            }
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
        // v6.89.3 — A STACKING BONUS HAS NO CAP, so the cap penalty must not
        // reach it. A live pick audit from a deep run shows TIME STOP +2S
        // carrying `maxed-40` from gt 3783 onward:
        //     gt 3783  took TIME STOP +2S  247  timestop+215 ... maxed-40 ...
        // It kept winning only because the deep-hell pool had collapsed to three
        // cards; in any richer pool it was handing back 40 points it never owed.
        // These three are CONSUMABLE STACKS, not levelled items — the crown run
        // finished with timestopBonus 162, against a live sample of 8 at level
        // 64, so the stat climbs far past anything a 6-level cap could mean.
        // Whatever lv/maxlv the card reports, `atCap` is the wrong question for
        // them.
        const STACKING = (type === 'sp_timestop' || type === 'sp_firecross' || type === 'sp_tequila');
        if (atCap && !STACKING) add(-40, 'maxed');
        // audit fix: measured means used to count TWICE (priority tables AND
        // ucb both scale with the same mean) — that double vote is what kept
        // dragging picks toward off-plan measured favorites. Once an item has
        // real data (n>=3), the ucb term is halved to a tiebreaker.
        add(ucbScore(name) * (((learn.items[name] || {}).n || 0) >= 3 ? 0.5 : 1), 'ucb');
        {
            // v6.107.0: both learned layers read ONE context vector. Building
            // it twice would be two different game states in the same pick.
            const xCtx = pickContext();
            add(ctxLearnBonus(name, xCtx), 'ctx-learn');   // contextual bandit layer (LinUCB), per card name
            add(tagLearnBonus(name, xCtx), 'tag-learn');   // the same layer generalised over ATTACK TYPE
        }

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
            // v6.92.1: was a hardcoded 5 while the cap lived in CONFIG — the
            // exemption outlived the cap it was meant to track.
            gunRiskExempt = nS < CAP_LINES() && !opensNewSuperLine('weapon', name) &&
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
        // v6.88.0 AUDIT C4. This was a 900 ms TIME window, not a latch. If the
        // pick click missed (clickCardByIndex/clickCardByName can both return
        // false and nobody checked), the whole side-effect block below re-ran
        // and repeated every mutation: ownedLevels bumped again, runPicks and
        // runPickCtx pushed again, craftsThisRun++ again. Five seconds of a
        // stuck pool recorded six picks of one card — and ownedLevels then
        // drifts ABOVE the true level, so atCap/isMaxed lie to the whole scorer
        // for the rest of the run.
        //
        // v6.88.1 L2: ...and the cure was worse than the disease. `lastPoolSig`
        // is cleared only at startRun, so the FIRST repeat of a pool signature
        // latched handleLevelUp to `false` for the rest of the run. Above LV 60
        // the pool is mostly stat cards with no level in the signature, so the
        // same trio recurs within a few levels — after which the level-up screen
        // stayed up forever, the game clock froze, and the generic stuck-breaker
        // spent the run clicking the settings gear, the recipe book and pause.
        // Observed live at LV 71 / TIME 69:46 with the screen open and
        // "picked TIME STOP +2S" still on the panel.
        //
        // The two cases the old 900 ms window could not tell apart are told
        // apart by pool IDENTITY, not content: the game allocates a new array
        // per level-up, so a new object is always a new decision, while the
        // same object within the window is our own missed click. The real C4
        // defect — side effects recorded for a pick that never landed — is
        // fixed below instead, by committing them only after the pick lands.
        if (pool === lastPoolRef && sig === lastPoolSig && now - lastPickAt < 900) return false;
        learnFromPool(pool);
        if (hellDetected) applyHellUnban();

        const scored = pool.map(scoreCard).sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (!best) return false;

        // v6.87.3 (user): "at a certain point in the early hell mode, there are
        // only 2 choices forcing the bot to pick a super cocktail leading item".
        // A FORCED pool is one where EVERY card walks an off-plan super line —
        // no safe sink on offer, so whatever we take advances the gate. Two
        // things follow.
        //
        // First, this is worth a re-roll even when the pool does not look
        // "weak": the old threshold (best < 22) misses a pool of two decent
        // cards that both happen to be gun paths.
        //
        // Second, it is worth RECORDING. The mechanic behind a two-card pool is
        // not something I can read from here — most likely the plan's own lines
        // have hit their caps and can no longer absorb a level, so the game has
        // nothing left to offer but new ones. `pineBot.gunForced()` keeps what
        // was actually on the table so the cause can be read off real runs
        // instead of guessed at.
        const gunRisk = c => gunPathProgress(String((c && c.type) || '').toLowerCase(), baseNameOf(c));
        const forcedGunPool = pool.length > 0 && pool.every(c => {
            const t = String((c && c.type) || '').toLowerCase();
            if (t === 'rainbowup') return true;
            return (t === 'weapon' || t === 'passive') && gunRisk(c) > 0;
        });
        if (forcedGunPool) {
            gunForcedLog.push({
                gt: Math.round((typeof G.gameTime === 'number' ? G.gameTime : 0)),
                hell: hellDetected === true,
                offered: pool.map(c => baseNameOf(c) + '(' + String((c && c.type) || '') + ' lv' + (levelOf(c) || 0) +
                    ' risk' + gunRisk(c).toFixed(2) + ')'),
                supers: supersMade.size,   // liveSuperCount is scoped inside scoreCard
                took: null
            });
            while (gunForcedLog.length > 40) gunForcedLog.shift();
            log('FORCED gun pool (' + pool.length + ' cards, all gun paths): ' +
                gunForcedLog[gunForcedLog.length - 1].offered.join(' | '));
        }

        // GINGER BEER grants level-up RE-ROLLS (recipe book): if the whole
        // pool is weak, spend one instead of eating a dead pick. Once per pool.
        // v6.87.3: a forced gun pool re-rolls on its own account, whatever it
        // scores — spending a re-roll is strictly better than opening a line.
        if ((best.score < 22 || forcedGunPool) && sig !== lastRerollSig) {
            const rr = findByText(/re-?roll/i);
            if (rr) {
                lastRerollSig = sig;
                clickEl(rr);
                setStatus(forcedGunPool ? 'forced gun pool — re-rolled' : 'weak pool — re-rolled');
                return true;
            }
        }

        // v6.88.1 L2: TAKE THE CARD FIRST. Everything below this line mutates
        // run state — ownedLevels, runPicks, the milestone counters, the LinUCB
        // training set — and none of it may be recorded for a pick the game
        // never received. This is the defect AUDIT C4 was aiming at; ordering
        // fixes it without a latch that can outlive the screen.
        const landed = hasGame('pickUpgrade')
            ? (callGame('pickUpgrade', best.index), true)
            : (clickCardByIndex(best.index) || clickCardByName(best.name));
        if (!landed) return false;   // retry next tick; nothing recorded

        lastPoolSig = sig;
        lastPoolRef = pool;
        lastPickAt = now;
        levelupStuckAt = 0;

        // Commit to a build the first time we take a cocktail.
        if (!primaryCocktail && COCKTAILS.includes(best.name)) primaryCocktail = best.name;
        ownedLevels[best.name] = Math.max(ownedLevels[best.name] || 0, (best.lv || 0) + 1);
        // v6.89.0: remember a max BEFORE a craft can absorb it. This is the
        // only moment the information exists — after fusion the half is gone
        // from ownedLevels and every super-key guard would read it as level 0.
        if (ownedLevels[best.name] >= (ownedMax[best.name] || best.cap || 6)) everMaxed.add(best.name);
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
        else if (best.type === 'rainbowup') { rainbowThisRun = true; rainbowAt = gameMs(); }

        // v6.87.3: close the loop — which of the bad options did we eat?
        if (forcedGunPool && gunForcedLog.length) gunForcedLog[gunForcedLog.length - 1].took = best.name;
        pickAudit.push({
            gt: Math.round((typeof G.gameTime === 'number' ? G.gameTime : 0)),
            took: best.name, score: Math.round(best.score), why: best.why.trim(),
            over: scored.slice(1, 3).map(o => o.name + '=' + Math.round(o.score))
        });
        if (pickAudit.length > 14) pickAudit.shift();
        log('level-up:', scored.map(s => `${s.name}(${s.type})=${s.score.toFixed(0)}`).join('   '));
        setStatus('picked ' + best.name);

        lastLevelUpAt = gameMs();
        return true;   // v6.88.1 L2: the pick already landed, above.
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
    // v6.88.0 AUDIT C3/S2: findByText with a veto, so a matching-but-forbidden
    // element (the hell leaderboard TOGGLE; an OK on the name form) is skipped
    // without masking a legitimate match elsewhere on the screen.
    function clickTextIf(re, ok) {
        const all = [...document.querySelectorAll('button, a, [role="button"], [onclick], .btn, div, span, li')];
        let best = null, bestLen = Infinity;
        for (const el of all) {
            let t = '';
            try { t = (el.textContent || '').trim(); } catch (e) { continue; }
            if (!t || t.length > 120 || !re.test(t) || !visible(el)) continue;
            if (typeof ok === 'function' && !ok(el)) continue;
            if (t.length < bestLen) { best = el; bestLen = t.length; }
        }
        return clickEl(best);
    }

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

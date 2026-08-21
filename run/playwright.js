#!/usr/bin/env node
// Run the bot without a userscript manager.
//   npm i playwright && npx playwright install chromium
//   node run/playwright.js [--headless] [--tabs N] [--profile DIR]
// A persistent profile keeps the game's localStorage (learning state,
// snapshots, the hell board) between launches, exactly like a browser.
const path = require('path');
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const headless = !!flag('--headless', false);
const tabs = parseInt(flag('--tabs', '1'), 10) || 1;
const profile = path.resolve(flag('--profile', './profile'));
const script = path.join(__dirname, '..', 'dist', 'pine-bot.user.js');

(async () => {
    const { chromium } = require('playwright');
    const ctx = await chromium.launchPersistentContext(profile, {
        headless,
        viewport: { width: 1100, height: 800 },
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
    });
    await ctx.addInitScript({ path: script });
    const pages = [];
    for (let i = 0; i < tabs; i++) {
        const page = i === 0 && ctx.pages().length ? ctx.pages()[0] : await ctx.newPage();
        page.on('console', m => { const t = m.text(); if (/\[PineBot\] (RUN END|stopped|HELL #1|started)/.test(t)) console.log(`[tab ${i}] ${t.split('\n')[0]}`); });
        await page.goto('https://pineandco.online/', { waitUntil: 'domcontentloaded' });
        pages.push(page);
    }
    console.log(`pine-bot: ${tabs} tab(s) running, profile ${profile}, headless=${headless}. Ctrl+C to stop.`);
    // Crown watch: if any tab's bot stops for a record, shout.
    setInterval(async () => {
        for (const [i, p] of pages.entries()) {
            try {
                const r = await p.evaluate(() => window.pineBot && window.pineBot.learn && document.querySelector('#pbStatus') && document.querySelector('#pbStatus').textContent);
                if (r && /HELL #1|TOP RECORD/.test(r)) console.log(`\n*** [tab ${i}] ${r} ***\a`);
            } catch (e) { }
        }
    }, 15000);
})().catch(e => { console.error(e); process.exit(1); });

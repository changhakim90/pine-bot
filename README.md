# Pine Bot

Autonomous player for [Pine & Co](https://pineandco.online/). Reads the game's real internals, plans movement on true coordinates, drives every menu through the game's own API, and learns across runs (CEM optimizer + bandits). Stops on a Hell-mode #1 so you can type your own name.

## Layout

```
src/        the script, in six ordered parts (edit these, never dist/)
dist/       pine-bot.user.js — built, committed, what the browser installs
test/       headless smoke tests (fake DOM + game globals, no browser)
run/        Playwright runner — run the bot without a userscript manager
results/    📸 snapshot JSON per version (commit them with each release)
CHANGELOG.md  per-version performance log
```

## Develop

```
npm run build     # src/*.js -> dist/pine-bot.user.js, version stamped from package.json
npm test          # build + syntax check + headless tests
```

Bump the version in `package.json` only — the build stamps it into the `@version` header and the in-script `SCRIPT_VERSION`. Tag releases `vX.Y.Z`.

## Install in a browser (Violentmonkey / Tampermonkey)

1. Set `pineBot.rawBase` in `package.json` to `https://raw.githubusercontent.com/<you>/<repo>/main`, rebuild, commit.
2. Open `https://raw.githubusercontent.com/<you>/<repo>/main/dist/pine-bot.user.js` — the manager offers to install it and will self-update on every pushed version bump.

Run only ONE manager's copy at a time: two copies fight over the keys and double-count runs.

## Run with Playwright (no extension)

```
npm i playwright && npx playwright install chromium
node run/playwright.js                 # headed, persistent ./profile
node run/playwright.js --tabs 3        # parallel farm (shared localStorage = shared learning)
node run/playwright.js --headless
```

The persistent profile keeps `localStorage` (learning state, snapshots, hell board) between launches. Background-tab throttling is disabled, so tabs keep full frame rate.

## Comparing versions

In the game tab: the 📸 panel button, or in the console `pineBot.compare()` / `pineBot.table()`. Judge versions on `medianTimeS`, `p60`, `p120` and the `vsPrev.z` score — never on best time, which grows with run count. Save the JSON into `results/<version>.json` when you tag a release.

## Config knobs worth knowing

- `bartenderRotation`: `['pat','joe']` by default — alternates bartenders each run; set `preferredBartender: 'minguk'` (or `'pat'`/`'joe'`) to pin one, or `bartenderRotation: null` to fall back to the UCB bartender bandit. Each bartender learns in its own localStorage store (`pineBotUCB_v5`, `_pat`, `_joe`); versions/snapshots are shared in `pineBotUCB_v5_shared`. `pineBot.reset()` only clears the active bartender.
- `scoringProfile`: `'crown-6.74'` (default — the rulebook that beat the crown) or `'6.79'`.
- `hellUnbanIngredients`: ingredients that join the plan once a run is in hell (`GINGER BEER` → SUPER MOSCOW MULE, the fifth super).
- `deepHell`: contact posture ramp past the 2-hour mark.
- `stopOnHellRecord`: pause for manual name entry on a hell #1.

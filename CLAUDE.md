# Pine Bot — Claude Development Guide

## About This Project

Pine Bot is an autonomous player for Pine & Co (pineandco.online). It's a userscript built from source files, tested headless, and runnable via Violentmonkey/Tampermonkey or Playwright.

The bot reads game internals, plans movement on true coordinates, drives menus through the game API, and learns across runs using a CEM optimizer + bandits. It stops on Hell-mode #1 so you can type your own name.

## Project Structure

```
src/        the script source code in six ordered parts (edit these)
dist/       pine-bot.user.js — built output, what the browser installs
test/       headless smoke tests (fake DOM + game globals, no browser)
run/        Playwright runner — run the bot without userscript manager
results/    📸 snapshot JSON per version (performance logs)
CHANGELOG.md  per-version performance and feature log
```

## Build & Test

```bash
npm run build     # src/*.js -> dist/pine-bot.user.js, version stamped
npm test          # build + syntax check + headless tests
npm run run       # Run with Playwright (browser window)
npm run run:headless  # Run with Playwright (headless)
```

## Development Workflow

1. **Edit source files only** in `src/` — never directly edit `dist/pine-bot.user.js`
2. **Run `npm test`** before committing to verify build and tests pass
3. **Bump version** in `package.json` only (semver) — the build stamps it into:
   - `@version` header in the userscript
   - `SCRIPT_VERSION` constant in the script
4. **Tag releases** as `vX.Y.Z` matching the version

## What Claude Should Do

- **Code changes**: Edit `src/` files, run `npm test`, commit with clear messages
- **Bug fixes**: Reproduce in headless tests if possible, fix in source, test
- **Features**: Add to appropriate part of `src/`, update tests, update CHANGELOG
- **Performance**: Reference `results/` snapshots, log improvements in CHANGELOG

## Key Files to Know

- `package.json` — version, scripts, rawBase URL (for browser installation)
- `build.js` — build process that creates dist/pine-bot.user.js
- `test/run.js` — headless test runner
- `run/playwright.js` — Playwright browser automation entry point
- `CHANGELOG.md` — performance and version history log

## Important Notes

- Version is single source of truth in `package.json`
- Only ONE userscript manager copy should run at a time (they fight over keys)
- The `pineBot.rawBase` URL in package.json is used for browser auto-updates
- Headless tests use fake DOM + game globals, no actual browser needed

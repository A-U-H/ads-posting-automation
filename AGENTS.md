# AGENTS.md

Run all commands from `ads-posting-automation/` (the repo root `C:\Users\PC\Desktop\ES` only contains this folder).

aven.bot = Playwright automation for [avanture.net](https://www.avanture.net) (Slovenian classifieds). It logs in, publishes a listing, waits a configurable timer, then deletes it, looping forever. A vanilla-JS dashboard (Vite) drives it over REST + WebSocket. ESM throughout (`"type": "module"`).

## Commands

- `npm run dev` — runs BOTH Express (`nodemon server/index.js`, port 3001) and Vite (port 5173). You almost always want this.
- `npm run dev:server` / `npm run dev:client` — run one side only.
- `npm start` — production: serves `dist/` via Express static + SPA fallback. Requires `npm run build` first.
- `npm run build` — `vite build` (Vite `root` is `src/`, output `dist/`).
- `npm run install:browser` — `npx playwright install chromium`. **Required** before the bot can launch; missing browser looks like a cryptic Playwright crash.
- There is **no test suite, linter, or typecheck**. Don't hunt for them.
- `AvenBot.bat` / `AvenBot.vbs` — Windows one-click launchers: start `node server/index.js` on 3001 (if not listening) and open the dashboard. They use the production build, not Vite.

## Wiring / ports

- Vite proxies `/api` and `/screenshots` → `http://localhost:3001` (vite.config.js).
- The WS client hardcodes the dev mapping: page on `5173` → WS to `3001`, otherwise same port (src/js/websocket.js:24). In production WS shares the static server port, so `.env` `PORT` must match.
- `VITE_WS_PORT` in `.env.example` is **not read anywhere** — the port is hardcoded in JS.
- `.env` is loaded by `dotenv/config` in `server/index.js`. Only `PORT` and `AVANTURE_USER`/`AVANTURE_PASS` (for `server/inspect_*.js`) are used.

## Architecture

- `server/index.js` — Express + `ws` WebSocketServer at `/ws`. Wires the singleton logger to broadcast to all clients.
- `server/routes/bot.js` — REST `/api/bot`: `start`, `stop`, `step`, `test/next`, `test/skip`, `status`, `logs`. `start` validates then **fire-and-forgets** `bot.start(...)`; the HTTP response does not mean the run succeeded.
- `server/bot/automation.js` — `AvenBot` singleton (`export default bot`), the Playwright engine, 14 steps, headed Chromium (`headless: false`), no test framework.
- `server/bot/steps.js` — `STEPS` (14), `BOT_STATES`, lookup helpers. Keep step IDs in sync with `automation.js`.
- `server/bot/logger.js` — singleton, 500-entry ring buffer. **API is `info/success/warning/error`; there is no `warn()`** — two call sites (`automation.js:659`, `automation.js:1049`) still use `logger.warn` and will throw when hit.
- `server/bot/screenshotter.js` — saves PNGs to `screenshots/` (gitignored) and `cleanup()` wipes that dir on every bot start. `capture()` only writes when the step name contains `"error"`, so most step screenshots are no-ops.
- `src/js/app.js` — dashboard controller: form submit, mode selector, test controls, WS handlers. `src/js/{websocket,timeline,logger,ui}.js` are the client modules.

## Modes

- **auto** (default): runs all 14 steps continuously.
- **test** (`mode: 'test'` in the start body): each step blocks at `WAITING_STEP` until `POST /api/bot/test/next` (run) or `/test/skip`. On error it pauses instead of aborting. Timer step is capped to 10s.

## Operational gotchas

- **VPN required**: `checkVPN()` aborts unless `https://www.avanture.net/` is reachable (`fetch`, 10s timeout). The site is geo-restricted.
- Bot opens a **visible Chromium window**; needs a desktop session.
- WS events: `connected`, `status`, `log`, `screenshot`, `timer`, `complete`, `step_done`. `frame` is wired client-side but disabled server-side (`startLiveFrames`/`captureFrame` are stubs).
- `photoPath` may be a single image OR a directory; the server checks a directory contains images, and the bot picks a random image from it. Supported: jpg/jpeg/png/webp/gif/bmp.
- `timerUnit` is `hours` | `minutes`. `test_assets/test_photo.png` is a convenient local photo (gitignored).
- `server/inspect_*.js` are standalone headless Playwright probes for reverse-engineering site selectors; they read `AVANTURE_USER`/`AVANTURE_PASS` from `.env` and exit if unset.

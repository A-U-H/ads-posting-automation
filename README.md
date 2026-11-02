# aven.bot — ads-posting-automation

Playwright automation for [avanture.net](https://www.avanture.net) (Slovenian classifieds) with a real-time web dashboard.

The bot logs in, publishes a classified listing, waits a configurable timer, deletes the listing, and repeats forever. A vanilla-JS dashboard (built with Vite) drives the run and streams live status, logs, timer, and screenshots over REST + WebSocket.

> **VPN required.** avanture.net is geo-restricted. The bot refuses to start unless the site is reachable. It also launches a **visible Chromium window**, so a desktop session is required.

## Features

- Full 14-step listing lifecycle: login → create → publish → wait → delete → loop
- Headed Playwright browser with human-like typing, clicking, and dropdown selection
- Dashboard KPIs: engine state, active cycle, deletion timer, connection/VPN status
- Live step timeline, log console with search/filter, and error screenshots
- Configurable listing copy, location, photo, and wait duration (hours or minutes)
- **Auto Run** mode (continuous) and **Step Test** mode (advance/skip each step manually)
- Photo input accepts a single image file or a folder of images
- Auto-reconnecting WebSocket client (up to 20 attempts, exponential backoff)

## Tech stack

- Node.js + Express
- Playwright (Chromium)
- `ws` WebSocket server
- Vite (vanilla JS frontend)
- No framework, no database, no test suite/linter/typecheck

## Requirements

- Node.js 18+ (uses native `fetch` and `AbortSignal.timeout`)
- A VPN connection that can reach `https://www.avanture.net/`
- A desktop session (the bot runs non-headless)
- An avanture.net account

## Quick start

```bash
cd ads-posting-automation
npm install
npm run install:browser   # downloads Chromium; required or the bot crashes at launch
npm run dev               # Express on :3001 + Vite on :5173
```

Open **http://localhost:5173**, fill the form, choose a mode, and click **Start Bot**.

### Production

```bash
npm run build   # bundles the dashboard into dist/
npm start       # Express serves dist/ + API on :3001
```

Open **http://localhost:3001**.

On Windows you can also double-click `AvenBot.bat` or `AvenBot.vbs`. They start the production server on port 3001 (if it is not already listening) and open the dashboard in your browser.

## Configuration

Copy `.env.example` to `.env` if you need to override the port or use the inspection scripts:

```ini
PORT=3001
VITE_WS_PORT=3001   # not read by the app; WS port is hardcoded in src/js/websocket.js

# Used only by server/inspect_*.js helpers
AVANTURE_USER=
AVANTURE_PASS=
```

Credentials, listing details, photo path, and timer are entered in the dashboard form (saved to `localStorage`). The server does not persist them.

| Field | Notes |
| --- | --- |
| Username / Password | avanture.net account |
| Title / Description | Listing copy (Slovenian site; demo copy is Slovenian) |
| Category | Defaults to `He seeks her` |
| Country / State / City | e.g. Slovenia / Osrednjeslovenska / Ljubljana |
| Photo path | Absolute path to an image **or** a folder containing images |
| Timer value + unit | Wait before deletion; `minutes` or `hours` |
| Execution mode | `Auto Run` (continuous) or `Step Test` (manual advance) |

Supported image types: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`.

## Modes

- **Auto Run** — executes all steps continuously and loops cycles.
- **Step Test** — pauses before each step; the dashboard enables **Next Step** (run it) and **Skip Step**. Errors pause the flow instead of aborting. The wait timer is capped at 10 seconds so a walkthrough does not stall.

## Architecture

```
ads-posting-automation/
├─ server/
│  ├─ index.js              Express + WebSocket server (/ws)
│  ├─ routes/bot.js         REST API under /api/bot
│  ├─ bot/
│  │  ├─ automation.js      AvenBot singleton, Playwright engine, 14 steps
│  │  ├─ steps.js           Step metadata + BOT_STATES
│  │  ├─ logger.js          500-entry ring buffer + WS broadcast
│  │  └─ screenshotter.js   Screenshot capture + cleanup
│  └─ inspect_*.js          Standalone headless probes for site selectors
├─ src/
│  ├─ index.html            Dashboard markup
│  ├─ css/                  Styles
│  └─ js/                   app, websocket, timeline, logger, ui modules
├─ dist/                    Production build (gitignored)
├─ screenshots/             Runtime screenshots (gitignored, wiped on each start)
└─ vite.config.js           Vite root=src, output=dist, dev proxy to :3001
```

### Ports and wiring

- Express API + WebSocket: **3001** (`PORT`)
- Vite dev server: **5173**; proxies `/api` and `/screenshots` to `:3001`
- The WS client connects to `:3001` when the page is on `:5173`, otherwise to the page's own port

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/bot/start` | Start a run (`mode: "auto"` or `"test"`) |
| `POST` | `/api/bot/stop` | Stop the run and close the browser |
| `POST` | `/api/bot/step` | Advance the pending step (`action: "next"` or `"skip"`) |
| `POST` | `/api/bot/test/next` | Test mode: run the pending step |
| `POST` | `/api/bot/test/skip` | Test mode: skip the pending step |
| `GET` | `/api/bot/status` | Current state, step, progress, cycle, mode |
| `GET` | `/api/bot/logs?count=100` | Recent log entries |

`POST /api/bot/start` validates input and then runs the bot asynchronously; a `200` means the request was accepted, not that the run completed.

## WebSocket events

The dashboard connects to `/ws` and receives typed JSON messages:

- `connected` — handshake confirmation
- `status` — state, current step, progress, cycle, mode, next step
- `log` — timestamped log entry
- `screenshot` — error screenshot metadata and URL
- `timer` — deletion countdown
- `complete` — listing created/deleted or cycle completed
- `step_done` — test mode: current step finished

## Behavior notes

- Screenshots are captured only when a step name contains `error`, which avoids flickering the headed browser. The `screenshots/` directory is cleaned on every start.
- The UI-facing "live frame" event exists in the client but frame capture is currently disabled server-side.
- `logger` exposes `info`, `success`, `warning`, `error`. Two legacy `logger.warn(...)` call sites in `automation.js` will throw if reached.
- `server/inspect_*.js` are developer probes (headless Chromium) that read `AVANTURE_USER` / `AVANTURE_PASS` from `.env` and exit if unset.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot reach avanture.net` | Connect your VPN; the site is geo-restricted |
| Playwright launch error | Run `npm run install:browser` |
| Browser does not appear | Run in an interactive desktop session, not a headless/SSH context |
| Dashboard shows "Disconnected" | Ensure the Express server is on the expected port; check `PORT` |
| Login fails | Verify credentials; the bot detects the login form and aborts with a clear error |
| No photo uploaded | Confirm the path is absolute and points to a supported image or a folder containing one |

## Disclaimer

This project automates actions on a third-party website. Use it only with an account you are authorized to control and in compliance with avanture.net's terms of service and applicable law. The authors are not responsible for misuse or account restrictions.

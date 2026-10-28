# Brain Battle — real-time multiplayer quiz

A responsive neon-themed quiz game for 2–8 players. It includes 3 rounds, 15 questions, a server-authoritative 15-second timer, 100 points per correct answer, live scoreboards, tie-aware results, room codes, and reconnect support.

## Project structure

- `public/` — browser game (HTML, CSS, JavaScript)
- `server/` — Node.js + Socket.IO multiplayer server and question bank
- `tests/` — automated server and game-rule tests
- `netlify.toml` — Netlify static-site configuration
- `render.yaml` — Render web-service configuration
- `.env.example` — local/server environment template

## Requirements

- Node.js 20 or newer
- npm
- For public play: a Netlify account and a Render account

## Run locally

1. Install Node.js if it is not already installed: https://nodejs.org/
2. Open a terminal in the project folder.
3. Install packages:

   ```bash
   npm install
   ```

4. Start the game server:

   ```bash
   npm start
   ```

5. Serve the frontend separately on port 8888 and set `GAME_SERVER_URL=http://localhost:3000` for its build. For example, use any static file server on port 8888, run `npm run build`, then serve `public/` on port 8888. The backend allows localhost origins in development. For a two-port local setup on Windows PowerShell:

   ```powershell
   $env:GAME_SERVER_URL='http://localhost:3000'; npm run build
   npx http-server public -p 8888
   ```

   Then open `http://localhost:8888`. If the static server package is not installed, `npx` may ask to download it.

## Run automated tests

```bash
npm install
npm test
```

`npm run test:mock` runs the dependency-free unit and simulated multiplayer checks, including room limits, host permissions, scoring, reconnect behavior, the 15-question finish, and tie results. `npm test` additionally runs real Socket.IO client integration tests after dependencies have been installed. Tests do not prove that a public deployment is live.

## Deploy the multiplayer server to Render

1. Push the project to a GitHub repository.
2. In Render, choose **New → Web Service** and connect the repository.
3. Use these settings:
   - Root directory: project root
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
4. Add environment variables:
   - `NODE_ENV` = `production`
   - `CLIENT_ORIGIN` = your final Netlify URL, such as `https://your-brain-battle.netlify.app`
   - `ADDITIONAL_CLIENT_ORIGINS` = optional comma-separated additional frontend origins
5. Deploy and copy the service URL, for example `https://your-service.onrender.com`.
6. Open `https://your-service.onrender.com/health`. A successful service should return JSON with `"ok":true`.

**Note:** Render free instances may sleep when idle and can take a little time to wake up. In-memory rooms are lost if the server restarts or redeploys. This version is designed for casual rooms, not durable tournament storage.

## Deploy the frontend to Netlify

1. In Netlify, import the same GitHub repository.
2. Set the build command to `npm run build` and publish directory to `public`.
3. Set the environment variable `GAME_SERVER_URL` to your deployed Render URL (e.g. `https://your-service.onrender.com`, no trailing slash).
4. Deploy the site.
5. Copy your Netlify URL and set that exact origin as Render's `CLIENT_ORIGIN` environment variable. Save/redeploy the server if required.
6. Open the Netlify site in two separate browser sessions/devices, create a room in one, and join it from the other.

If you use a custom domain, update `CLIENT_ORIGIN` to that exact HTTPS origin too. Do not set `CLIENT_ORIGIN` to a path; it should be the origin only.

## Rules and behavior

- 2–8 players per room; six-character room codes.
- The host starts the game once at least two players have joined.
- 15 questions in three themed rounds, five questions per round.
- 15 seconds per question; 100 points for a correct answer, zero otherwise.
- The server decides the answer deadline and scoring. Each player may submit one answer per question.
- The correct answer is only sent to clients when the question closes.
- Reconnect with the browser's in-memory session while that tab is still open. Rooms are held in server memory and can be lost after a restart.
- If the host disconnects, a connected player is promoted to host.
- Tied top scores result in a shared win.

## Environment variables

Server (`.env` for local use):

- `PORT` — port to listen on (Render supplies this automatically)
- `CLIENT_ORIGIN` — allowed browser origin
- `ADDITIONAL_CLIENT_ORIGINS` — optional comma-separated origins
- `NODE_ENV` — use `production` on public hosting

Frontend build:

- `GAME_SERVER_URL` — public server origin used by the browser client

## Troubleshooting

- **Server unavailable:** check the Render service and `/health`; confirm `GAME_SERVER_URL` is correct.
- **CORS error:** set Render `CLIENT_ORIGIN` to the exact Netlify site origin, including `https://` and without a trailing slash.
- **Only one player can join:** create the room on one device, copy the code, and join with a different name on another browser/device.
- **Reconnect failed:** refresh/reopen can lose the in-memory reconnect token. Create/join again if the server says the session cannot be found.
- **Room disappears:** this starter keeps rooms in memory; server restarts clear them.

## Security notes / scope

This is a starter game, not a hardened public competitive gaming service. Resume tokens are bearer credentials and should not be shared. The app has no account system, database, rate limiting, or abuse moderation. Add persistent storage and operational safeguards before running high-stakes events.

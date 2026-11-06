# Deploy BattleGrid

BattleGrid is one **Node.js web service**, serving both the browser game and its authoritative Express/Socket.IO server. Arena PvP and Co-op Zombies run on the same host. A static-site-only host, serverless request handler, or separate frontend deployment will not run the game as configured.

## Requirements

- **Node.js 24 LTS, version 24.10 or newer within 24.x**, and npm. `package.json` declares this supported range; use the latest security-patched 24.x release.
- One continuously running Node process/instance. Do not enable horizontal autoscaling, PM2 cluster mode, or multiple container replicas.
- A public HTTPS URL with WebSocket upgrades and Socket.IO HTTP polling supported on the same port.
- A region near your players. Outpost, Foundry, and Citadel are logical map pools, not separate geographic servers.

No frontend build, database, Redis service, password secret, or external game service is currently required. Browser assets are checked in under `public/`.

> **Before a public launch:** the current dependency audit (2026-11-06) reports 12 issues: 2 moderate, 9 high, and 1 critical. Review and address applicable findings, then rerun verification. Adding environment configuration does not fix these existing dependencies; no automatic dependency upgrades were applied.

## 1. Configure the server

For a local machine or self-hosted server, copy `.env.example` to `.env` **in the project root** if no `.env` exists yet:

```sh
cp .env.example .env
```

Windows PowerShell: `Copy-Item .env.example .env`. Do not overwrite an existing configuration without checking it first.

The supplied local defaults are:

```dotenv
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `production`, or `test`. Use `production` on a deployed service; it configures Express before the app loads. It does not add authentication or persistence. |
| `PORT` | `3000` | Integer `0`–`65535`. Use a fixed nonzero port when self-hosting, or the hosting provider's injected port. `0` is useful only for an automatically allocated test port. |
| `HOST` | `0.0.0.0` | IP address or hostname to bind. Use `0.0.0.0` on managed/container hosts; use `127.0.0.1` behind a reverse proxy on the same machine. Do not include `http://`, a port, or IPv6 brackets. |

**Precedence:** existing process variables → project-root `.env` → defaults. A provider-supplied `PORT` wins even if a local file contains `PORT=3000`. Empty or invalid supported values stop startup; they do not silently fall back. A missing `.env` is allowed, but other file-read errors are fatal.

Only `.env` is loaded automatically, not `.env.local`, `.env.production`, or `.env.example`. No variable substitution such as `${PORT}` is performed. Restart the production process after changing settings; `npm run server` watches `.env` during development.

On a managed host, use its environment settings rather than uploading your local `.env`. `.env` and `.env.*` are ignored by Git except for `.env.example`. Never put these files in `public/`, publish secrets in the template, or configure a proxy to serve the repository root.

The browser uses the page's origin for `/api/*`, `/socket.io/*`, and invite links. There is no `PUBLIC_URL`, `API_URL`, or separate frontend environment file to configure. Share the provider's public URL or your HTTPS domain, not `0.0.0.0` or someone else's `localhost`.

## 2. Verify before deploying

From the project root:

```sh
npm ci
npm run check
npm test
npm audit
```

Tests start their own servers on available ports; no development server or external service is needed. Keep `package-lock.json` with the source so `npm ci` installs reproducibly.

Production startup is:

```sh
npm start
```

Do not use the development watcher in production. If installing with `npm ci --omit=dev`, run the checks/tests beforehand with development dependencies installed; Socket.IO client tests need them.

## 3. Deploy on Render

Render is a straightforward option because its Node web services provide HTTPS and support WebSockets on the same public endpoint.

1. Push the project source and lockfile to a Git repository supported by Render. Include `.env.example`, not `.env`. Review any uncommitted files before publishing.
2. In the [Render Dashboard](https://dashboard.render.com/), choose **New → Web Service** and connect the repository/branch. Do **not** choose Static Site.
3. Configure the service:

   | Setting | Value |
   | --- | --- |
   | Runtime / language | Node |
   | Root directory | Repository root (leave blank if BattleGrid is already at the root) |
   | Build command | `npm ci --include=dev && npm run check && npm test` |
   | Start command | `npm start` |
   | Health check path | `/api/health` |
   | Instance count | **1**, with autoscaling disabled |
   | Region | Closest practical region to your players |

4. Add these environment settings:

   ```dotenv
   NODE_ENV=production
   HOST=0.0.0.0
   ```

   Let Render supply `PORT`; do not copy the local port into its settings. The supported Node 24.x range is declared in `package.json`. If an existing service has a `NODE_VERSION` override, set it to `24` or remove the override so the declared range is used. `NODE_VERSION` is a Render build/runtime-selection setting, not an app setting loaded from `.env`.
5. Deploy, inspect logs for `BattleGrid is listening on ... (production).`, and open the assigned `https://<service-name>.onrender.com` URL. The listening address in logs is internal; share the public HTTPS URL with friends.
6. Complete the multiplayer checks below before inviting a larger group. For a custom domain, configure it and TLS in Render, then have all players use the same canonical URL.

**Compute plan:** a free instance is useful for a preview, not a reliable always-on game. Render documents idle spin-down after 15 minutes without inbound HTTP/WebSocket traffic, cold-start delays, usage limits, and possible restarts. Every restart/spin-down loses this game's in-memory state. Use an always-on plan for scheduled sessions, and measure CPU, memory, bandwidth, and latency under your expected player load; the simulation runs at 30 Hz with 20 Hz snapshots.

**Deploys interrupt matches:** managed platforms can briefly overlap old/new processes during a rollout, and reconnecting clients can land on the new process. Even a zero-downtime HTTP deploy cannot preserve these in-memory matches. Schedule releases between sessions and expect everyone to rejoin fresh rooms afterward.

Official references: [Express deployment](https://render.com/docs/deploy-node-express-app), [WebSocket support](https://render.com/docs/websocket), [Node version selection](https://render.com/docs/node-version), and [free-service limits](https://render.com/docs/free).

## 4. Self-host on a VM or another Node host

On a VM, install a supported Node 24.x release, deploy the source, run the verification commands above, and use this `.env` when the HTTPS reverse proxy runs on the same machine:

```dotenv
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
```

Start with `npm start`. Use the host's process supervisor (for example, systemd) to run exactly one `node server/server.js` process, set the repository as its working directory, restart after failures, and send `SIGTERM` when stopping. Use a dedicated unprivileged service account with read access to the project and `.env`. Do not rely on an SSH terminal staying open.

Expose HTTPS through Nginx, Caddy, or your provider's proxy. Allow public TCP 443 (and 80 if needed for certificate issuance/redirects); keep the internal game port private. Do not run Node as root just to bind port 443. If the proxy is in a different container or machine, bind to `0.0.0.0` instead and restrict access to the internal port through the private network/firewall.

For Nginx, add this location to your **already configured TLS `server` block**, replacing the upstream if you changed the port. Add the `map` in Nginx's `http` context, not inside the `server` block:

```nginx
# In the http context:
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

# Inside the TLS server block for your game domain:
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 75s;
    proxy_send_timeout 75s;
    proxy_buffering off;
}
```

Provision a valid certificate and redirect HTTP to HTTPS using your proxy's standard setup. This snippet is not a complete certificate/proxy installation guide. Route **all paths** to the app so `/socket.io/` supports both upgrades and polling. Do not cache `/api/*` or `/socket.io/*`, and do not let a CDN/proxy rule serve them as static HTML. Keep proxy idle timeouts above Socket.IO's default 45-second heartbeat window.

For other managed Node hosts, use the same install/start commands, `NODE_ENV=production`, `HOST=0.0.0.0`, the provider-supplied `PORT`, `/api/health`, and one instance. Choose a persistent web service rather than a short-lived/serverless runtime.

## 5. Check the deployed game

Replace the example host with your public URL:

```sh
curl -fsS https://your-game.example/api/health
```

Expect HTTP 200 with `"status":"ok"` plus public lobby summaries. This is a basic process/HTTP health check, not proof that multiplayer traffic reaches the server correctly.

- Open the game on two browsers/devices using the **same public URL**. Log in with different guest callsigns.
- Create a private Arena PvP room, copy its invite link, and join it from the other device. Check movement, shooting, chat, scoreboard, and leaving/rejoining.
- Repeat with Co-op Zombies: both players should see the same preparation countdown, waves, enemies, and shared score, without friendly fire.
- Join a different room on a third client, if available, and confirm it does not receive the first room's players or chat.
- In browser developer tools, verify the Socket.IO connection succeeds. The WebSocket upgrade should return **101 Switching Protocols**; polling can also function, but a failed upgrade indicates a proxy/host problem worth fixing for real-time play.
- Confirm `/styleguide.html` loads, and that `/.env`, `/.env.example`, and `/server/config.js` return 404 rather than exposing project files.
- Briefly interrupt a client's connection and confirm it can reconnect/rejoin. Restarting the server should create fresh rooms/scores, not restore the old match. Do this restart test only outside an active session.

## Operations and security limits

- Login is **guest callsign access**, not account authentication. Anyone who can reach the host can choose a name. Private rooms are hidden and invite-code joined, not password-protected accounts or an authorization system.
- Rooms, chat, match scores, and zombie runs are held only in memory. Restarts, deploys, crashes, and idle shutdowns reset them. A persistent disk alone does not change this. Empty custom rooms expire after five minutes.
- All maps/modes share one process. A Socket.IO adapter or sticky sessions alone would not share authoritative arena state; multi-instance support requires a separate architectural change.
- Keep the Node runtime and dependencies patched. Run `npm audit` before a public launch, review reported issues, and rerun checks/tests after updates. Avoid blindly applying `npm audit fix --force` to this working game.
- Socket.IO currently allows cross-origin connections (`cors.origin: "*"`); `.env` does not configure an origin allowlist. CORS is not authentication and does not prevent arbitrary WebSocket clients. For a public service, review origin checks, connection/room creation limits, and edge abuse protection as a separate hardening step.
- There are no persistent accounts, ranked records, backups of live games, or seamless match migration. Plan maintenance between sessions and communicate these limits to players.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Build reports an unsupported engine or missing `loadEnvFile` | Select Node 24.x (24.10+), and remove older provider `NODE_VERSION` overrides. |
| Startup reports an invalid variable | Use the allowed values above. Check hosting settings first: they override `.env`, even when a value is blank. |
| `EADDRINUSE` | Another process owns the port. Stop only the process you intend to replace, or choose a different port and update the proxy. |
| Health check fails / service is unreachable | Use `HOST=0.0.0.0` on managed hosts, accept their injected `PORT`, and verify proxy/firewall routing. A private loopback bind cannot be reached from another container. |
| Page loads but lobby/game does not connect | Check `/socket.io/` routing, WebSocket upgrade headers, HTTPS/mixed-content errors, proxy timeouts, and static-site/CDN rules. |
| Friends cannot join an invite | Use the exact same public host/domain. The room may be full, expired, or reset after a restart. `localhost` on a friend's computer is not your server. |
| Players see different room lists | Ensure there is only one running instance/process and no load balancing across independent hosts. |
| First load is slow or rooms disappear | Check free-plan spin-down, restarts, deploy logs, and resource limits. In-memory state cannot survive a process restart. |

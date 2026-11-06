# BattleGrid

A colorful browser-based, real-time multiplayer arena and co-op zombie survival game built with Phaser, Express, and Socket.IO.

## Run

Use **Node.js 24 LTS (24.10 or newer)**. From the project root:

```sh
npm ci
cp .env.example .env
npm run server
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`. Copy only if `.env` does not already exist; keep any local settings you have changed.

Open **http://localhost:3000**. `npm start` runs without the development watcher.
Both commands load the project-root `.env` using Node's built-in loader, even when launched from another directory. Existing process/hosting-platform variables take precedence, and `.env` is optional. The defaults are `PORT=3000`, `HOST=0.0.0.0`, and `NODE_ENV=development`; invalid settings stop startup with a clear error. The development watcher restarts on `.env` changes; restart `npm start` manually after editing configuration.

`.env` and its local variants are ignored by Git; `.env.example` is the shareable template. Never put environment files or secrets in `public/`.

## Deploy

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for configuration, Render deployment, a self-hosted reverse proxy, health checks, and multiplayer verification. Deploy one Node web service with HTTPS and WebSocket support, not a static site. All players must reach the same instance; rooms and scores reset when it restarts.

## Play with friends

1. Enter a callsign to log in as a guest.
2. Choose Vanguard, Recon, Medic, or Sentinel. Each has a distinct animated character and loadout.
3. Choose an arena pool: Outpost, Foundry, or Citadel. These are separate maps/room pools on the **same host**, not geographically distributed servers.
4. Pick **Arena PvP** or **Co-op Zombies**. Room lists and quick play match your selected mode; invite codes always join the invited room's mode.
5. Use Quick play / Survive now, join a public room, or create your own room. Private rooms are hidden from the browser and joined with a six-character invite code.
6. Use **Invite** in the match toolbar to copy a link for your friends.

For another computer on your network, use `http://<host-computer-LAN-IP>:3000`, not `localhost`. Allow the server through the host's firewall if necessary. Internet play requires a publicly reachable host or tunnel with WebSocket support. All players must connect to the same host.

### Controls

| Action | Controls |
| --- | --- |
| Move | WASD |
| Aim | Mouse or arrow keys |
| Fire | Left click or hold Space |
| Sprint | Shift (uses energy; cannot fire while sprinting) |
| Reload | R (also automatic when firing an empty magazine) |
| Room chat | Enter; Escape returns to the arena |
| Scoreboard | L or the toolbar button |
| Menu | Escape |
| Camera zoom | Mouse wheel |

Touch devices have directional, fire, and reload controls. Pickups restore health/ammo or swap weapons. Medic regenerates health outside combat. Spawn protection ends when firing.

### Game modes

- **Arena PvP:** free-for-all matches with the map's 8 / 12 / 16-player limit. Five-minute rounds reset the scoreboard; eliminated players can respawn after a short delay. Most eliminations wins, with fewer deaths breaking ties.
- **Co-op Zombies:** play alone or in a squad of up to four. An eight-second preparation countdown leads into endless, increasingly difficult waves. Walkers appear first, runners join from wave 3, and every fifth wave brings brutes. The server controls enemy movement, wall-aware navigation, melee attacks, and scores. Teammates cannot damage or block each other's shots.
- Each zombie kill adds to a **shared team score** (walker 100 / runner 125 / brute 300), with an additional 250 × wave bonus for clearing a wave. The HUD shows the wave, remaining hostiles (including incoming spawns), living teammates, and team score; the scoreboard shows each operator's zombie kills and deaths this run.
- Clearing a wave restores fallen teammates, heals living teammates by up to 40, refills magazines, adds reserve ammo, and restores map pickups. The next wave begins after seven seconds. If everyone falls, the run ends and the whole squad returns for a fresh run after ten seconds. There is no mid-wave manual respawn. Joining during a squad-wipe countdown waits for the new run rather than canceling the defeat.

Outpost has a grassy green palette, Foundry rust-orange cover and steel lanes, and Citadel blue-stone fortifications. Operators have distinct colored armor; zombies have their own animated artwork. Terrain is cached for Canvas rendering, and reduced-motion settings preserve gameplay while disabling ambient and character animation.

## Verify

```sh
npm run check
npm test
```

Tests use Node's built-in runner and real Socket.IO clients on automatically allocated ports. They do not use the development server. A focused test:

```sh
node --test --test-name-pattern="spawn shields" server/tests/arena.test.js
```

`/styleguide.html` previews the shared UI classes, states, and controls.

## Deliberate limits

- Login is **name-based guest access**, not password authentication. The browser remembers your callsign/operator preferences; there are no persistent accounts.
- Rooms, chat, and match scores live in memory. Restarting the Node process resets them. Empty custom rooms expire after five minutes.
- Gameplay positions, zombies, waves, damage, ammo, reloads, pickups, and room membership are server-controlled. Each room has isolated state; a single scheduler advances all rooms. Hordes are capped at 32 simultaneous zombies and 80 total per wave to bound simulation work.
- This is a single-process community game, not a production-ranked service or multi-instance deployment.

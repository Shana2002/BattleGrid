# BattleGrid

## Commands and verification

- Use Node.js 24 LTS (24.10+). From the root: `npm ci`, copy `.env.example` to `.env` if needed, then `npm run server`; `npm start` runs without watching. `nodemon.json` watches server/shared catalog changes and `.env`, not browser-only edits or tests.
- Verify with `npm run check` then `npm test`. The tests start their own servers on ephemeral ports; no running game or external service is required. Focus one test with `node --test --test-name-pattern="spawn shields" server/tests/arena.test.js`.
- `server/test.js` is an old standalone server on port 3000, not a test suite. Only `server/tests/*.test.js` is wired to `npm test`; `public/js/test.js` and `main1.js` are not active entrypoints.
- `server/config.js` loads the project-root `.env` before application dependencies; existing process variables take precedence. `PORT`/`HOST`/`NODE_ENV` are validated; defaults are `3000`/`0.0.0.0`/`development`. Missing `.env` is allowed. Keep `.env` ignored and outside `public/`; see `DEPLOYMENT.md`. Friends must use the host's LAN/public URL, not their own `localhost`.

## Boundaries and gotchas

- `server/server.js` only starts/stops the process. `server/app.js` wires HTTP/Socket.IO and the single simulation scheduler; `server/lobby.js` owns room membership metadata; `server/GameLogic/arena.js` owns each isolated match. The other old GameLogic files are not used by the active game.
- `public/shared/catalog.js` is imported directly by Node and the browser: keep it DOM/Node-free. It is the source for operators, weapons, maps, and timing rules. Never trust client-supplied position, damage, ammo, or room ownership.
- `public/js/main.js` owns login/lobby/HUD/socket lifecycle; `public/js/game/arena-scene.js` renders gameplay without registering socket listeners. Procedural sprite sheets in `game/characters.js` are shared by lobby portraits and Phaser.
- No frontend bundler: `Phaser` comes from checked-in `public/js/phaser.min.js`, not the npm dependency; `io` comes from `/socket.io/socket.io.js`. UI tokens/primitives live in `public/css/app.css`; preview them at `/styleguide.html`.
- Login is guest callsign access, not account authentication. All arena pools share this one host; rooms/scores are in memory and reset on process restart. Empty custom rooms expire after five minutes. Keep these limits explicit in UI/docs.
- Multiplayer changes need cross-room isolation, reconnect/leave cleanup, and multi-client verification. The server simulates at 30 Hz and snapshots at 20 Hz; do not reintroduce per-connection intervals. Movement and walls use the shared map's positive coordinates.

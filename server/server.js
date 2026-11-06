import { loadConfig } from "./config.js";

try {
  const { port, host, nodeEnv } = loadConfig();
  // Load dependencies only after NODE_ENV is configured.
  const { createGameServer } = await import("./app.js");
  const game = createGameServer();

  game.httpServer.on("error", (error) => {
    console.error(`Unable to start BattleGrid: ${error.message}`);
    game.close().finally(() => process.exit(1));
  });

  game.httpServer.listen(port, host, () => {
    const actualPort = game.httpServer.address().port;
    const bindHost = host.includes(":") ? `[${host}]` : host;
    console.log(`BattleGrid is listening on http://${bindHost}:${actualPort} (${nodeEnv}).`);
    if (nodeEnv !== "production") {
      const localHost = ["0.0.0.0", "::"].includes(host) ? "localhost" : bindHost;
      console.log(`Open http://${localHost}:${actualPort}. Share this computer's LAN address with friends.`);
    }
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => game.close().then(() => process.exit(0)));
  }
} catch (error) {
  console.error(`Unable to start BattleGrid: ${error.message}`);
  process.exitCode = 1;
}

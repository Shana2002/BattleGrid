import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readConfig } from "../config.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const configUrl = new URL("../config.js", import.meta.url);
const entry = fileURLToPath(new URL("../server.js", import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "battlegrid-config-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function environment(overrides = {}) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["PORT", "HOST", "NODE_ENV"].includes(key.toUpperCase())));
  return { ...inherited, ...overrides };
}

function runConfig({ envFile, env = {}, cwd = root, moduleUrl = configUrl.href } = {}) {
  const options = envFile === undefined ? {} : { envFile };
  const script = `import { loadConfig } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(loadConfig(${JSON.stringify(options)})));`;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", script], { env: environment(env), cwd, encoding: "utf8", timeout: 10000 });
}

function resultConfig(result) {
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${errors || output}`)), 10000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/BattleGrid is listening on (http:\/\/127\.0\.0\.1:\d+) \(production\)\./);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited with ${code}: ${errors || output}`)); });
  });
}

test("configuration has explicit defaults when no variables are set", () => {
  assert.deepEqual(readConfig({}), { port: 3000, host: "0.0.0.0", nodeEnv: "development" });
});

test("configuration normalizes valid port, hostname, and runtime settings", () => {
  assert.deepEqual(readConfig({ PORT: " 4100 ", HOST: " localhost ", NODE_ENV: " production " }), { port: 4100, host: "localhost", nodeEnv: "production" });
  assert.equal(readConfig({ PORT: "65535", HOST: "game.example.com", NODE_ENV: "test" }).port, 65535);
});

test("configuration accepts ephemeral ports and bare IPv6 addresses", () => {
  assert.deepEqual(readConfig({ PORT: "0", HOST: "::1", NODE_ENV: "test" }), { port: 0, host: "::1", nodeEnv: "test" });
});

test("configuration rejects invalid or empty ports instead of falling back", () => {
  for (const PORT of ["", " ", "-1", "1.5", "1e3", "0x1234", "Infinity", "NaN", "65536", "999999999999999999999"]) {
    assert.throws(() => readConfig({ PORT }), /PORT must be a whole number/, PORT);
  }
});

test("configuration rejects URLs, ports, and malformed bind hosts", () => {
  for (const HOST of ["", " ", "https://example.com", "localhost:3000", "127.0.0.1:3000", "[::1]", "bad host", "bad/host", "bad_.com", "-host"]) {
    assert.throws(() => readConfig({ HOST }), /HOST must be an IP address or hostname/, HOST);
  }
});

test("configuration rejects unsupported or empty NODE_ENV values", () => {
  for (const NODE_ENV of ["", " ", "prod", "staging"]) {
    assert.throws(() => readConfig({ NODE_ENV }), /NODE_ENV must be development, production, or test/, NODE_ENV);
  }
});

test("the built-in loader reads quoted values and comments from an env file", (t) => {
  const envFile = join(fixture(t), ".env");
  writeFileSync(envFile, '# local configuration\nPORT="4100" # game port\nHOST=127.0.0.1\nNODE_ENV=test\n');
  assert.deepEqual(resultConfig(runConfig({ envFile })), { port: 4100, host: "127.0.0.1", nodeEnv: "test" });
});

test("hosting-platform variables take precedence over env-file values", (t) => {
  const envFile = join(fixture(t), ".env");
  writeFileSync(envFile, "PORT=4100\nHOST=0.0.0.0\nNODE_ENV=development\n");
  const env = { PORT: "5200", HOST: "127.0.0.1", NODE_ENV: "production" };
  assert.deepEqual(resultConfig(runConfig({ envFile, env })), { port: 5200, host: "127.0.0.1", nodeEnv: "production" });
  const invalid = runConfig({ envFile, env: { PORT: "" } });
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.match(invalid.stderr, /PORT must be a whole number/);
});

test("a missing env file is optional", (t) => {
  const envFile = join(fixture(t), "missing.env");
  assert.deepEqual(resultConfig(runConfig({ envFile })), { port: 3000, host: "0.0.0.0", nodeEnv: "development" });
});

test("other env-file read errors are not silently ignored", (t) => {
  const result = runConfig({ envFile: fixture(t) });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Unable to read environment file/);
});

test("the default env-file path is anchored to the project rather than the working directory", (t) => {
  const directory = fixture(t);
  const serverDirectory = join(directory, "server");
  const unrelatedDirectory = join(directory, "other-working-directory");
  mkdirSync(serverDirectory);
  mkdirSync(unrelatedDirectory);
  const modulePath = join(serverDirectory, "config.mjs");
  copyFileSync(fileURLToPath(configUrl), modulePath);
  writeFileSync(join(directory, ".env"), "PORT=4100\nHOST=127.0.0.1\nNODE_ENV=test\n");
  writeFileSync(join(unrelatedDirectory, ".env"), "PORT=5200\nHOST=0.0.0.0\nNODE_ENV=development\n");
  assert.deepEqual(resultConfig(runConfig({ cwd: unrelatedDirectory, moduleUrl: pathToFileURL(modulePath).href })), { port: 4100, host: "127.0.0.1", nodeEnv: "test" });
});

test("the real startup fails clearly before opening a server for invalid configuration", () => {
  const result = spawnSync(process.execPath, [entry], { env: environment({ PORT: "invalid", HOST: "127.0.0.1", NODE_ENV: "production" }), cwd: root, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 1, result.stderr || result.error?.message);
  assert.match(result.stderr, /Unable to start BattleGrid: PORT must be a whole number/);
  assert.ok(!result.stdout.includes("is listening"));
});

test("the real production startup uses an allocated port and never serves environment files", { timeout: 20000 }, async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "battlegrid-startup-"));
  const child = spawn(process.execPath, [entry], { env: environment({ PORT: "0", HOST: "127.0.0.1", NODE_ENV: "production" }), cwd, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "exit");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      timer.unref();
      child.kill("SIGTERM");
      await closed;
      clearTimeout(timer);
    }
    rmSync(cwd, { recursive: true, force: true });
  });
  const url = await waitForServer(child);
  const response = await fetch(`${url}/api/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.status, "ok");
  assert.ok(health.rooms.some((room) => room.mode === "zombies"));
  assert.equal((await fetch(url)).status, 200);
  for (const path of ["/.env", "/.env.example", "/server/config.js"]) {
    assert.equal((await fetch(`${url}${path}`)).status, 404, path);
  }
});

import { isIP } from "node:net";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const defaultEnvFile = fileURLToPath(new URL("../.env", import.meta.url));

export function readConfig(env = process.env) {
  const portValue = (env.PORT ?? "3000").trim();
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be a whole number from 0 to 65535 (0 selects an available port).");
  }

  const host = (env.HOST ?? "0.0.0.0").trim();
  const hostname = host.length <= 253 && host.split(".").every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label));
  if (!isIP(host) && !hostname) {
    throw new Error("HOST must be an IP address or hostname, without a protocol, brackets, or port.");
  }

  const nodeEnv = (env.NODE_ENV ?? "development").trim();
  if (!["development", "production", "test"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, production, or test.");
  }
  return { port, host, nodeEnv };
}

export function loadConfig({ envFile = defaultEnvFile } = {}) {
  try {
    // Node's loader never overwrites variables already supplied by the host.
    loadEnvFile(envFile);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Unable to read environment file: ${error.message}`, { cause: error });
    }
  }
  const config = readConfig();
  process.env.NODE_ENV = config.nodeEnv;
  return config;
}

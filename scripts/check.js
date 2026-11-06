import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith(".js") && entry.name !== "phaser.min.js") files.push(full);
  }
}
for (const directory of ["server", "public/js", "public/shared", "scripts"]) collect(join(root, directory));
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`${relative(root, file)}: ${result.stderr || result.error?.message}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log(`Syntax checked ${files.length} JavaScript files.`);

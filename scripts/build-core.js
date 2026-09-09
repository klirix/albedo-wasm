#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const albedoDir = path.join(root, "albedo");

function findZig() {
  const candidates = [
    process.env.ZIG,
    path.join(os.homedir(), ".zig", "0.16.0", "zig"),
    "zig",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["version"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim().startsWith("0.16")) {
      return candidate;
    }
  }

  throw new Error(
    "Zig 0.16.x is required to build albedo.wasm. Install it or set $ZIG to the binary.",
  );
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const zig = findZig();
const version = spawnSync(zig, ["version"], { encoding: "utf8" }).stdout.trim();
console.log(`Using zig ${version} (${zig})`);

run(
  zig,
  ["build", "-Dtarget=wasm32-freestanding", "--release=fast"],
  albedoDir,
);

const wasmSrc = path.join(albedoDir, "zig-out", "bin", "albedo.wasm");
const wasmDest = path.join(root, "src", "albedo.wasm");
fs.copyFileSync(wasmSrc, wasmDest);
console.log(`Copied ${wasmSrc} -> ${wasmDest}`);

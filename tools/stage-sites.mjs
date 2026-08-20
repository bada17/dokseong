import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = new URL("../dist/", import.meta.url);
const distPath = fileURLToPath(distDir);
const candidates = readdirSync(distPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "client" && entry.name !== ".openai" && entry.name !== "server")
  .map((entry) => join(distPath, entry.name))
  .filter((path) => existsSync(join(path, "index.js")) && existsSync(join(path, "wrangler.json")));

if (candidates.length !== 1) {
  throw new Error(`Expected one Worker output directory, found ${candidates.length}`);
}

const serverDir = join(distPath, "server");
rmSync(serverDir, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });
cpSync(candidates[0], serverDir, { recursive: true });

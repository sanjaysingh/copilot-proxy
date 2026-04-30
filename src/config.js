import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_DIR = process.env.COPILOT_PROXY_CONFIG_DIR || path.join(os.homedir(), ".copilot-proxy");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function getConfigPath() {
  return CONFIG_FILE;
}

export async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function writeConfig(config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function updateConfig(patch) {
  const existing = await readConfig();
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await writeConfig(next);
  return next;
}

export async function clearConfig() {
  try {
    await fs.rm(CONFIG_FILE);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

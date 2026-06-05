import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, "..", "..", "settings.json");

export type Settings = {
  defaultRpmLimit: number;
  maxKeysPerUser: number;
  registrationsEnabled: boolean;
  siteName: string;
  maintenanceMode: boolean;
};

const DEFAULTS: Settings = {
  defaultRpmLimit: 60,
  maxKeysPerUser: 5,
  registrationsEnabled: true,
  siteName: "CommandCode",
  maintenanceMode: false,
};

function load(): Settings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, "utf8");
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULTS };
}

let _settings: Settings = load();

export function getSettings(): Settings {
  return { ..._settings };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  _settings = { ..._settings, ...patch };
  try {
    writeFileSync(SETTINGS_PATH, JSON.stringify(_settings, null, 2), "utf8");
  } catch {}
  return { ..._settings };
}

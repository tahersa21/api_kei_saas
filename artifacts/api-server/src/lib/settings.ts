import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, "..", "..", "settings.json");

export type ModelOverride = {
  hidden?: boolean;
  displayName?: string;
  price?: { input: number; output: number }; // USD per 1M tokens
};

export type Settings = {
  defaultRpmLimit: number;
  maxKeysPerUser: number;
  registrationsEnabled: boolean;
  siteName: string;
  maintenanceMode: boolean;
  modelOverrides: Record<string, ModelOverride>;
};

const DEFAULTS: Settings = {
  defaultRpmLimit: 60,
  maxKeysPerUser: 5,
  registrationsEnabled: true,
  siteName: "CommandCode",
  maintenanceMode: false,
  modelOverrides: {},
};

function load(): Settings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULTS, ...parsed, modelOverrides: parsed.modelOverrides ?? {} };
    }
  } catch {}
  return { ...DEFAULTS };
}

let _settings: Settings = load();

export function getSettings(): Settings {
  return { ..._settings, modelOverrides: { ..._settings.modelOverrides } };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  _settings = { ..._settings, ...patch };
  try {
    writeFileSync(SETTINGS_PATH, JSON.stringify(_settings, null, 2), "utf8");
  } catch {}
  return getSettings();
}

export function setModelOverride(modelId: string, override: ModelOverride | null): Settings {
  const overrides = { ..._settings.modelOverrides };
  if (override === null) {
    delete overrides[modelId];
  } else {
    overrides[modelId] = { ...overrides[modelId], ...override };
  }
  return updateSettings({ modelOverrides: overrides });
}

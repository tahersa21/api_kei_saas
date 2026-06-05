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

export type CreditTransaction = {
  id: string;
  delta: number;       // positive = add, negative = deduct
  note: string;
  createdAt: string;   // ISO timestamp
};

export type Settings = {
  defaultRpmLimit: number;
  maxKeysPerUser: number;
  registrationsEnabled: boolean;
  siteName: string;
  maintenanceMode: boolean;
  modelOverrides: Record<string, ModelOverride>;
  // clerkUserId → balance in credits (1 credit = $0.01 by convention)
  userCredits: Record<string, number>;
  // clerkUserId → last N transactions
  creditTransactions: Record<string, CreditTransaction[]>;
};

const DEFAULTS: Settings = {
  defaultRpmLimit: 60,
  maxKeysPerUser: 5,
  registrationsEnabled: true,
  siteName: "CommandCode",
  maintenanceMode: false,
  modelOverrides: {},
  userCredits: {},
  creditTransactions: {},
};

// ── Credit helpers ─────────────────────────────────────────────────────────────

export function getUserCredit(clerkUserId: string): number {
  return _settings.userCredits[clerkUserId] ?? 0;
}

export function adjustUserCredit(clerkUserId: string, delta: number, note: string): Settings {
  const current = _settings.userCredits[clerkUserId] ?? 0;
  const next = Math.max(0, current + delta);
  const credits = { ..._settings.userCredits, [clerkUserId]: next };

  // Append transaction (keep last 50)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tx: CreditTransaction = { id, delta, note, createdAt: new Date().toISOString() };
  const prev = _settings.creditTransactions[clerkUserId] ?? [];
  const creditTransactions = { ..._settings.creditTransactions, [clerkUserId]: [...prev, tx].slice(-50) };

  return updateSettings({ userCredits: credits, creditTransactions });
}

export function getUserTransactions(clerkUserId: string): CreditTransaction[] {
  return (_settings.creditTransactions[clerkUserId] ?? []).slice().reverse(); // newest first
}

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

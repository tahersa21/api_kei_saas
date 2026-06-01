import { useState, useCallback } from "react";

export type ApiKeyEntry = {
  id: string;
  label: string;
  key: string;
};

const KEYS_STORAGE = "commandcode_api_keys";
const ACTIVE_KEY_STORAGE = "commandcode_active_key_id";

function loadKeys(): ApiKeyEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORAGE) ?? "[]");
  } catch {
    return [];
  }
}

function saveKeys(keys: ApiKeyEntry[]) {
  localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
}

export function getActiveApiKey(): string {
  const keys = loadKeys();
  if (keys.length === 0) return "";
  const activeId = localStorage.getItem(ACTIVE_KEY_STORAGE);
  const found = keys.find((k) => k.id === activeId);
  return found ? found.key : keys[0].key;
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>(loadKeys);
  const [activeId, setActiveId] = useState<string>(
    () => localStorage.getItem(ACTIVE_KEY_STORAGE) ?? loadKeys()[0]?.id ?? ""
  );

  const addKey = useCallback((label: string, key: string) => {
    const entry: ApiKeyEntry = { id: crypto.randomUUID(), label: label.trim() || "Account", key: key.trim() };
    setKeys((prev) => {
      const next = [...prev, entry];
      saveKeys(next);
      return next;
    });
    // auto-select if first key
    setActiveId((prev) => {
      const current = prev || entry.id;
      if (!prev) localStorage.setItem(ACTIVE_KEY_STORAGE, entry.id);
      return current;
    });
    return entry.id;
  }, []);

  const removeKey = useCallback((id: string) => {
    setKeys((prev) => {
      const next = prev.filter((k) => k.id !== id);
      saveKeys(next);
      return next;
    });
    setActiveId((prev) => {
      if (prev !== id) return prev;
      const remaining = loadKeys().filter((k) => k.id !== id);
      const newActive = remaining[0]?.id ?? "";
      localStorage.setItem(ACTIVE_KEY_STORAGE, newActive);
      return newActive;
    });
  }, []);

  const selectKey = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_KEY_STORAGE, id);
    setActiveId(id);
  }, []);

  const activeKey = keys.find((k) => k.id === activeId) ?? keys[0];

  return { keys, activeId, activeKey, addKey, removeKey, selectKey };
}

import { useState, useCallback } from "react";

const AG_KEY_STORAGE = "aigocode_api_key";

export function getAiGoCodeApiKey(): string {
  try { return localStorage.getItem(AG_KEY_STORAGE) ?? ""; }
  catch { return ""; }
}

export function useAiGoCodeKey() {
  const [key, setKeyState] = useState<string>(() => getAiGoCodeApiKey());

  const setKey = useCallback((newKey: string) => {
    const trimmed = newKey.trim();
    if (trimmed) localStorage.setItem(AG_KEY_STORAGE, trimmed);
    else localStorage.removeItem(AG_KEY_STORAGE);
    setKeyState(trimmed);
  }, []);

  return { key, setKey };
}

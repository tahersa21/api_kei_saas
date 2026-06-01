import { useState, useCallback } from "react";

const RC_KEY_STORAGE = "rightcode_api_key";

export function getRightCodeApiKey(): string {
  try { return localStorage.getItem(RC_KEY_STORAGE) ?? ""; }
  catch { return ""; }
}

export function useRightCodeKey() {
  const [key, setKeyState] = useState<string>(() => getRightCodeApiKey());

  const setKey = useCallback((newKey: string) => {
    const trimmed = newKey.trim();
    if (trimmed) localStorage.setItem(RC_KEY_STORAGE, trimmed);
    else localStorage.removeItem(RC_KEY_STORAGE);
    setKeyState(trimmed);
  }, []);

  return { key, setKey };
}

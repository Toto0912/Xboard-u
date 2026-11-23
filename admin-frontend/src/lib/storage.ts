const STORAGE_PREFIX = 'Xboard_';
const ACCESS_TOKEN_KEY = 'access_token';

interface StoredRecord<T> {
  value: T;
  time: number;
  expire: number | null;
}

function fullKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`.toUpperCase();
}

export function getStoredToken(): string | null {
  const key = fullKey(ACCESS_TOKEN_KEY);
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredRecord<string>;
    if (parsed.expire !== null && parsed.expire !== undefined && parsed.expire <= Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return typeof parsed.value === 'string' && parsed.value ? parsed.value : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

/**
 * Persist Sanctum Bearer token in the exact legacy Xboard_ACCESS_TOKEN format
 * so existing sessions and other panel pages remain compatible.
 */
export function setStoredToken(token: string, ttlSeconds: number | null = null): void {
  const key = fullKey(ACCESS_TOKEN_KEY);
  const payload: StoredRecord<string> = {
    value: token,
    time: Date.now(),
    expire: ttlSeconds !== null ? Date.now() + ttlSeconds * 1000 : null,
  };
  localStorage.setItem(key, JSON.stringify(payload));
}

export function removeStoredToken(): void {
  localStorage.removeItem(fullKey(ACCESS_TOKEN_KEY));
}

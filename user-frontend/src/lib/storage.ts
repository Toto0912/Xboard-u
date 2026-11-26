const TOKEN_KEY = 'xboard_user_auth_data';
const LEGACY_TOKEN_KEY = 'authorization';
const SESSION_EVENT = 'xboard-user-session';

export function subscribeToSession(listener: () => void): () => void {
  // A same-tab write does not fire the browser's storage event.
  window.addEventListener(SESSION_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(SESSION_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // ignore storage quota / private mode errors
  }
}

export function removeStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Local storage that cannot throw.
 *
 * Every caller was wrapping its own `try`/`catch` around the same two lines, for the same two
 * reasons: storage is unavailable in private mode and in some embedded webviews, and a stored value
 * can be anything if it was written by an older build or edited by hand. Neither is worth an
 * exception escaping into a render path, so both are handled once, here.
 */

export const readStoredText = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Parse a stored JSON value, falling back when it is missing, corrupt, or the wrong shape. */
export const readStoredJson = <T>(key: string, fallback: T, isValid?: (value: unknown) => value is T): T => {
  const raw = readStoredText(key);
  if (raw === null) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValid && !isValid(parsed)) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
};

/** Returns whether the write landed, for the rare caller that wants to know. */
export const writeStoredText = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const writeStoredJson = (key: string, value: unknown) => {
  try {
    return writeStoredText(key, JSON.stringify(value));
  } catch {
    // `JSON.stringify` throws on cycles and on BigInt. Nothing stored here has either, but a
    // serialisation bug must not take a save path down with it.
    return false;
  }
};

export const removeStored = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do: the value is already unreachable.
  }
};

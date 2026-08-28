import { useCallback, useEffect, useRef, useState } from 'react';
import { getItem, setItem } from './native';

const read = async (key, fallback) => {
  try { const v = await getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

/**
 * A list persisted to AsyncStorage, newest first, de-duplicated by url.
 * Writes are skipped until the initial read finishes, so a slow load can't
 * overwrite real data with an empty array.
 */
export function usePersistedList(key, cap = 300) {
  const [items, setItems] = useState([]);
  const ref = useRef([]);
  const loaded = useRef(false);

  useEffect(() => {
    read(key, []).then((v) => { ref.current = v; setItems(v); loaded.current = true; });
  }, [key]);

  const write = useCallback((next) => {
    ref.current = next;
    setItems(next);
    if (loaded.current) setItem(key, JSON.stringify(next));
  }, [key]);

  return {
    items,
    add: useCallback((item) => {
      if (!item?.url) return;
      write([{ ...item, at: Date.now() }, ...ref.current.filter((x) => x.url !== item.url)].slice(0, cap));
    }, [write, cap]),
    remove: useCallback((url) => write(ref.current.filter((x) => x.url !== url)), [write]),
    clear: useCallback(() => write([]), [write]),
    has: useCallback((url) => ref.current.some((x) => x.url === url), []),
  };
}

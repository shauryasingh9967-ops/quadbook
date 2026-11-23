import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from '../lib/api';

/** Small data-loading hook: loads on mount and whenever deps change; exposes reload + error state. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try { const d = await fn(); if (id === seq.current) { setData(d); setError(null); } }
    catch (e) { if (id === seq.current) setError(errMsg(e)); }
    finally { if (id === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void run(); }, [run]);
  return { data, loading, error, reload: run, setData };
}

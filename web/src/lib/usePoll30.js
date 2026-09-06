import { useState, useEffect, useRef, useCallback } from "react";

/**
 * usePoll30
 * 30s background polling hook that dims indicators during active refresh
 * without resetting data or triggering full-component skeleton shimmers.
 *
 * @param {Function} fetchFn Async function returning fresh data.
 * @param {Object} [options]
 * @param {number} [options.intervalMs=30000] Interval in milliseconds (default 30s).
 * @param {boolean} [options.enabled=true] Whether polling is active.
 * @param {Function} [options.onSuccess] Callback on fetch success.
 * @param {Function} [options.onError] Callback on fetch error.
 */
export function usePoll30(fetchFn, { intervalMs = 30000, enabled = true, onSuccess, onError } = {}) {
  const [data, setData] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const executeFetch = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setIsInitialLoading(true);
    } else {
      setIsPolling(true);
    }

    try {
      const result = await fetchRef.current();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
      if (onSuccessRef.current) onSuccessRef.current(result);
    } catch (err) {
      console.warn("[usePoll30] fetch error:", err);
      setError(err?.message || "Failed to refresh telemetry");
      if (onErrorRef.current) onErrorRef.current(err);
    } finally {
      if (isInitial) {
        setIsInitialLoading(false);
      }
      setIsPolling(false);
    }
  }, []);

  const refetch = useCallback(() => executeFetch(false), [executeFetch]);

  useEffect(() => {
    if (!enabled) return;

    let timerId = null;
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await executeFetch(true);
      if (cancelled) return;

      timerId = setInterval(() => {
        if (!cancelled) executeFetch(false);
      }, intervalMs);
    };

    run();

    return () => {
      cancelled = true;
      if (timerId) clearInterval(timerId);
    };
  }, [enabled, intervalMs, executeFetch]);

  return {
    data,
    setData,
    isInitialLoading,
    isPolling,
    lastUpdated,
    error,
    refetch,
  };
}

export default usePoll30;

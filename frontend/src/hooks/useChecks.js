import { useState, useCallback } from "react";
import { api } from "../services/api";

export function useChecks(bundleId) {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!bundleId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.checks(bundleId);
      setChecks(result.checks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [bundleId]);

  // Add a check to local state immediately (optimistic update)
  const addLocal = useCallback((checkData) => {
    setChecks((prev) => [...prev, checkData]);
  }, []);

  const advance = useCallback(async (checkId, recipientName) => {
    const result = await api.advanceCheck(checkId, recipientName);
    return result;
  }, []);

  const remove = useCallback(async (checkId) => {
    await api.deleteCheck(checkId);
  }, []);

  return { checks, loading, error, refresh, advance, remove, addLocal };
}

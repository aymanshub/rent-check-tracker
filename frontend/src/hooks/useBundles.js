import { useState, useCallback } from "react";
import { api } from "../services/api";

export function useBundles() {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.bundles();
      setBundles(result.bundles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (data) => {
    const result = await api.createBundle(data);
    return result.bundle;
  }, []);

  const close = useCallback(async (bundleId) => {
    await api.closeBundle(bundleId);
  }, []);

  const reopen = useCallback(async (bundleId) => {
    await api.reopenBundle(bundleId);
  }, []);

  const remove = useCallback(async (bundleId) => {
    await api.deleteBundle(bundleId);
  }, []);

  return { bundles, loading, error, refresh, create, close, reopen, remove };
}

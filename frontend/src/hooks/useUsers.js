import { useState, useCallback } from "react";
import { api } from "../services/api";

export function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.users();
      setUsers(result.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const add = useCallback(async (data) => {
    const result = await api.addUser(data);
    return result.user;
  }, []);

  const remove = useCallback(async (userId) => {
    await api.removeUser(userId);
  }, []);

  return { users, loading, error, refresh, add, remove };
}

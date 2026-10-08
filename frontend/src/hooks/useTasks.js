import { useState, useEffect } from 'react';
import { fetchTasks } from '../api';

export function useTasks(query, status, page, pageSize) {
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    // Debounce timer for search keystrokes
    const handler = setTimeout(() => {
      fetchTasks({ query, status, page, pageSize })
        .then((data) => {
          if (!isCancelled) {
            setTasks(data.items || []);
            setTotal(data.total || 0);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            setError(err.message);
            setLoading(false);
          }
        });
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(handler);
    };
  }, [query, status, page, pageSize]);

  return { tasks, total, loading, error };
}
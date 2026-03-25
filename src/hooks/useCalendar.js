import { useState, useEffect, useCallback } from 'react';
import { getCalendarEvents } from '../lib/api';

function groupByDay(events) {
  const groups = {};
  for (const event of events) {
    const dt = event.start.dateTime || event.start.date;
    if (!dt) continue;
    const dayKey = dt.slice(0, 10); // YYYY-MM-DD
    if (!groups[dayKey]) groups[dayKey] = [];
    groups[dayKey].push(event);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEvents]) => ({ date, events: dayEvents }));
}

export function useCalendar(account) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCalendarEvents(account.email, account.provider);
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grouped = groupByDay(events);

  return { events, grouped, loading, error, refresh };
}

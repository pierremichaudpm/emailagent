import { getSupabase } from './utils/supabase.js';
import { getAccessToken } from './utils/auth.js';
import { getFreeBusy } from './services/google-calendar.js';

const WORK_START = 9; // 9h00
const WORK_END = 17; // 17h00

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const providerName = url.searchParams.get('provider') || 'gmail';
    const days = Math.min(parseInt(url.searchParams.get('days') || '5', 10), 14);
    const duration = parseInt(url.searchParams.get('duration') || '60', 10);

    if (!email) {
      return new Response(JSON.stringify({ error: 'Paramètre email requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();
    const { data: account, error: dbError } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', email)
      .eq('provider', providerName)
      .single();

    if (dbError || !account) {
      return new Response(JSON.stringify({ error: 'Compte non trouvé' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(account);

    // Range: from tomorrow morning to N days out
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    const busySlots = await getFreeBusy(accessToken, {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      timeZone: 'America/Montreal',
    });

    // Compute free slots per day
    const free = [];
    const current = new Date(startDate);

    for (let d = 0; d < days; d++) {
      const dayStart = new Date(current);
      dayStart.setHours(WORK_START, 0, 0, 0);
      const dayEnd = new Date(current);
      dayEnd.setHours(WORK_END, 0, 0, 0);

      // Skip weekends (0=Sun, 6=Sat)
      const dow = current.getDay();
      if (dow === 0 || dow === 6) {
        current.setDate(current.getDate() + 1);
        continue;
      }

      // Get busy periods for this day
      const dayBusy = busySlots
        .map((s) => ({ start: new Date(s.start), end: new Date(s.end) }))
        .filter((s) => s.start < dayEnd && s.end > dayStart)
        .map((s) => ({
          start: s.start < dayStart ? dayStart : s.start,
          end: s.end > dayEnd ? dayEnd : s.end,
        }))
        .sort((a, b) => a.start - b.start);

      // Find free slots of at least `duration` minutes
      const slots = [];
      let cursor = new Date(dayStart);

      for (const busy of dayBusy) {
        if (cursor < busy.start) {
          const gap = (busy.start - cursor) / 60000;
          if (gap >= duration) {
            slots.push(formatSlot(cursor, busy.start));
          }
        }
        if (busy.end > cursor) cursor = new Date(busy.end);
      }

      // After last busy slot
      if (cursor < dayEnd) {
        const gap = (dayEnd - cursor) / 60000;
        if (gap >= duration) {
          slots.push(formatSlot(cursor, dayEnd));
        }
      }

      const dateStr = current.toISOString().slice(0, 10);
      free.push({ date: dateStr, slots });

      current.setDate(current.getDate() + 1);
    }

    return new Response(JSON.stringify({ free }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function formatSlot(start, end) {
  const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fmt(start)}-${fmt(end)}`;
}

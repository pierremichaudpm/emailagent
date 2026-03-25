const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

async function calendarFetch(accessToken, path, opts = {}) {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function normalizeEvent(event) {
  const isAllDay = !event.start?.dateTime;
  return {
    id: event.id,
    summary: event.summary || '(Sans titre)',
    start: {
      dateTime: event.start?.dateTime || null,
      date: event.start?.date || null,
    },
    end: {
      dateTime: event.end?.dateTime || null,
      date: event.end?.date || null,
    },
    location: event.location || null,
    description: event.description || null,
    attendees: (event.attendees || []).map((a) => ({
      email: a.email,
      displayName: a.displayName || a.email,
      responseStatus: a.responseStatus || 'needsAction',
    })),
    status: event.status || 'confirmed',
    isAllDay,
    htmlLink: event.htmlLink || null,
  };
}

export async function listEvents(accessToken, { timeMin, timeMax, calendarId = 'primary', timeZone = 'America/Montreal' } = {}) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    timeZone,
    maxResults: '100',
  });

  const data = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return (data.items || [])
    .filter((e) => e.status !== 'cancelled')
    .map(normalizeEvent);
}

export async function getFreeBusy(accessToken, { timeMin, timeMax, timeZone = 'America/Montreal' } = {}) {
  const data = await calendarFetch(accessToken, '/freeBusy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone,
      items: [{ id: 'primary' }],
    }),
  });

  const busy = data.calendars?.primary?.busy || [];
  return busy.map((slot) => ({
    start: slot.start,
    end: slot.end,
  }));
}

import { useState } from 'react';

function formatTime(event) {
  if (event.isAllDay) return 'Journée';
  const dt = event.start.dateTime;
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Montreal' });
}

function formatDuration(event) {
  if (event.isAllDay) return '';
  const start = event.start.dateTime;
  const end = event.end.dateTime;
  if (!start || !end) return '';
  const diffMin = Math.round((new Date(end) - new Date(start)) / 60000);
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function formatDayLabel(dateStr) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('fr-CA', { timeZone: 'America/Montreal' }).replace(/\//g, '-');
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('fr-CA', { timeZone: 'America/Montreal' }).replace(/\//g, '-');

  // dateStr is YYYY-MM-DD
  if (dateStr === todayStr) return "Aujourd'hui";
  if (dateStr === tomorrowStr) return 'Demain';

  const d = new Date(dateStr + 'T12:00:00');
  const label = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Montreal' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function EventRow({ event }) {
  return (
    <div className="flex items-center gap-3 py-2 min-h-[44px]">
      <span className="text-sm font-medium text-[#5c4a3a] w-14 text-right tabular-nums flex-shrink-0">
        {formatTime(event)}
      </span>
      <span className="w-2 h-2 rounded-full bg-[#8b7355] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-[#5c4a3a] truncate block">{event.summary}</span>
      </div>
      {formatDuration(event) && (
        <span className="text-xs text-[#a0937d] flex-shrink-0">{formatDuration(event)}</span>
      )}
    </div>
  );
}

export default function CalendarWidget({ grouped, loading, error }) {
  const [expanded, setExpanded] = useState(false);

  // Graceful fallback on error or no data
  if (error) {
    return null; // Don't break the briefing
  }

  if (loading) {
    return (
      <div className="mx-4 sm:mx-6 mb-4 p-4 bg-[#f5f0e8] rounded-2xl border border-[#e8e0d4]">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#8b7355] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#8b7355]">Chargement du calendrier...</span>
        </div>
      </div>
    );
  }

  if (!grouped || grouped.length === 0) {
    return (
      <div className="mx-4 sm:mx-6 mb-4 p-4 bg-[#f5f0e8] rounded-2xl border border-[#e8e0d4]">
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <span className="text-sm text-[#8b7355] font-medium">Aucun événement à venir</span>
        </div>
      </div>
    );
  }

  const todayGroup = grouped[0];
  const restGroups = grouped.slice(1);
  const todayCount = todayGroup.events.length;

  return (
    <div className="mx-4 sm:mx-6 mb-4 p-4 bg-[#f5f0e8] rounded-2xl border border-[#e8e0d4]">
      {/* Today header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <h3 className="text-sm font-serif font-semibold text-[#5c4a3a]">
            {formatDayLabel(todayGroup.date)} — {todayCount} événement{todayCount > 1 ? 's' : ''}
          </h3>
        </div>
      </div>

      {/* Today events */}
      <div className="ml-1">
        {todayGroup.events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>

      {/* Future days */}
      {restGroups.length > 0 && (
        <>
          {expanded ? (
            <div className="mt-3 pt-3 border-t border-[#e8e0d4]">
              {restGroups.map((group) => (
                <div key={group.date} className="mb-3 last:mb-0">
                  <h4 className="text-xs font-serif font-semibold text-[#8b7355] uppercase tracking-wide mb-1">
                    {formatDayLabel(group.date)} — {group.events.length} événement{group.events.length > 1 ? 's' : ''}
                  </h4>
                  {group.events.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-sm text-[#8b7355] hover:text-[#5c4a3a] font-medium transition-colors min-h-[44px] flex items-center gap-1"
          >
            {expanded ? 'Réduire' : `${restGroups.length} autre${restGroups.length > 1 ? 's' : ''} jour${restGroups.length > 1 ? 's' : ''}`}
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

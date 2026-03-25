import { useState } from 'react';
import { createCalendarEvent } from '../lib/api';

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

function QuickCreateForm({ account, onCreated, onCancel }) {
  const [form, setForm] = useState({ summary: '', date: '', startTime: '09:00', endTime: '10:00' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!form.summary || !form.date) return;
    setCreating(true);
    setError(null);
    try {
      await createCalendarEvent(account.email, account.provider || 'gmail', {
        summary: form.summary,
        start: `${form.date}T${form.startTime}:00`,
        end: `${form.date}T${form.endTime}:00`,
      });
      onCreated();
    } catch (err) {
      setError(err.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#e8e0d4] space-y-2">
      <input
        type="text"
        value={form.summary}
        onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
        placeholder="Titre de l'événement"
        className="w-full px-3 py-2 text-sm border border-[#e0d5c5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b7355] bg-white min-h-[44px]"
        autoFocus
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          className="flex-1 px-3 py-2 text-sm border border-[#e0d5c5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b7355] bg-white min-h-[44px]"
        />
        <input
          type="time"
          value={form.startTime}
          onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          className="w-24 px-2 py-2 text-sm border border-[#e0d5c5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b7355] bg-white min-h-[44px]"
        />
        <input
          type="time"
          value={form.endTime}
          onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
          className="w-24 px-2 py-2 text-sm border border-[#e0d5c5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b7355] bg-white min-h-[44px]"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={!form.summary || !form.date || creating}
          className="px-4 py-2 text-sm bg-[#5c4a3a] text-white rounded-xl font-semibold hover:bg-[#4a3a2e] disabled:opacity-40 transition-colors min-h-[44px]"
        >
          {creating ? 'Création...' : 'Créer'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-[#8b7355] hover:text-[#5c4a3a] font-medium min-h-[44px]"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

export default function CalendarWidget({ grouped, loading, error, account, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <span className="text-sm text-[#8b7355] font-medium">Aucun événement à venir</span>
          </div>
          {account && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8b7355] hover:bg-[#ede5d8] hover:text-[#5c4a3a] transition-colors min-h-[44px] min-w-[44px]"
              title="Ajouter un événement"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
        {showCreate && account && (
          <QuickCreateForm
            account={account}
            onCreated={() => { setShowCreate(false); if (onRefresh) onRefresh(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}
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
        {account && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8b7355] hover:bg-[#ede5d8] hover:text-[#5c4a3a] transition-colors min-h-[44px] min-w-[44px]"
            title="Ajouter un événement"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
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

      {/* Quick create form */}
      {showCreate && account && (
        <QuickCreateForm
          account={account}
          onCreated={() => { setShowCreate(false); if (onRefresh) onRefresh(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

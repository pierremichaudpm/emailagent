import { useEffect } from 'react';
import { useDecisions } from '../hooks/useDecisions';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-CA');
}

function StatusBadge({ status }) {
  if (status === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Résolu
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      En attente
    </span>
  );
}

function DaysIndicator({ days, deadline }) {
  const isOverdue = deadline && new Date(deadline) < new Date();
  const isUrgent = days >= 5;
  const color = isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-gray-400';

  return (
    <span className={`text-xs font-medium ${color}`}>
      {days} jour{days !== 1 ? 's' : ''}
      {isOverdue && ' — deadline dépassée'}
    </span>
  );
}

function DecisionRow({ decision }) {
  return (
    <div className="flex items-start gap-3 p-4 sm:p-5 border-b border-stone-100 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <StatusBadge status={decision.status} />
          <DaysIndicator days={decision.days_waiting || 0} deadline={decision.detected_deadline} />
        </div>
        <p className="text-sm text-gray-800 leading-relaxed">{decision.summary || 'Aucun résumé'}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          <span>Créé le {formatDate(decision.created_at)}</span>
          {decision.detected_deadline && (
            <span>Deadline : {formatDate(decision.detected_deadline)}</span>
          )}
          {decision.resolved_at && (
            <span>Résolu le {formatDate(decision.resolved_at)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DecisionTracker({ account, onBack }) {
  const { pending, resolved, loading, checking, error, refresh, check } = useDecisions(account);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const total = pending.length + resolved.length;

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-sm border-b border-stone-200/60 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Suivi des décisions</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {pending.length} en attente, {resolved.length} résolue{resolved.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={check}
              disabled={checking || loading}
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm text-white hover:bg-brand-600 disabled:opacity-50 font-semibold transition-colors"
            >
              {checking ? 'Vérification...' : 'Vérifier'}
            </button>
            <button
              onClick={onBack}
              className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-white font-medium transition-colors"
            >
              Retour
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {loading && (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400 mt-4 font-medium">Chargement...</p>
          </div>
        )}

        {!loading && total === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 font-medium">Aucune décision en suivi.</p>
            <p className="text-sm text-gray-400 mt-1">Les décisions sont créées automatiquement lors de l'analyse.</p>
          </div>
        )}

        {pending.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 mb-4 overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-stone-100 bg-stone-50/50">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                En attente ({pending.length})
              </h2>
            </div>
            {pending.map((d) => (
              <DecisionRow key={d.id} decision={d} />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-stone-100 bg-stone-50/50">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Résolues ({resolved.length})
              </h2>
            </div>
            {resolved.map((d) => (
              <DecisionRow key={d.id} decision={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

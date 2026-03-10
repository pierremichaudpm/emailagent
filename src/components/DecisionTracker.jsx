import { useEffect } from 'react';
import { useDecisions } from '../hooks/useDecisions';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-CA');
}

function StatusBadge({ status }) {
  if (status === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Résolu
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      En attente
    </span>
  );
}

function DaysIndicator({ days, deadline }) {
  const isOverdue = deadline && new Date(deadline) < new Date();
  const isUrgent = days >= 5;

  const color = isOverdue
    ? 'text-red-600'
    : isUrgent
      ? 'text-orange-600'
      : 'text-gray-500';

  return (
    <span className={`text-xs ${color}`}>
      {days} jour{days !== 1 ? 's' : ''}
      {isOverdue && ' (deadline dépassée)'}
    </span>
  );
}

function DecisionRow({ decision }) {
  return (
    <div className="flex items-start gap-3 p-4 border-b border-gray-100 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <StatusBadge status={decision.status} />
          <DaysIndicator days={decision.days_waiting || 0} deadline={decision.detected_deadline} />
        </div>
        <p className="text-sm text-gray-900">{decision.summary || 'Aucun résumé'}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto flex items-center justify-between p-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Suivi des décisions</h1>
            <p className="text-sm text-gray-500">{pending.length} en attente, {resolved.length} résolue{resolved.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={check}
              disabled={checking || loading}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {checking ? 'Vérification...' : 'Vérifier'}
            </button>
            <button
              onClick={onBack}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Retour
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        {loading && (
          <div className="p-6 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500 mt-2">Chargement...</p>
          </div>
        )}

        {!loading && total === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-400">Aucune décision en suivi.</p>
            <p className="text-sm text-gray-400 mt-1">Les décisions sont créées automatiquement lors de l'analyse IA.</p>
          </div>
        )}

        {/* Décisions en attente */}
        {pending.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                En attente ({pending.length})
              </h2>
            </div>
            {pending.map((d) => (
              <DecisionRow key={d.id} decision={d} />
            ))}
          </div>
        )}

        {/* Décisions résolues */}
        {resolved.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
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

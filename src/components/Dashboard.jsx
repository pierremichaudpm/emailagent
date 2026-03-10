import { useEffect, useState } from 'react';
import { useEmails } from '../hooks/useEmails';
import { useAnalyses } from '../hooks/useAnalyses';

const PRIORITY_CONFIG = {
  critical: { label: 'Critique', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  high: { label: 'Important', color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  low: { label: 'Faible', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
};

const CATEGORY_LABELS = {
  action_requise: 'Action requise',
  information: 'Information',
  suivi: 'Suivi',
  finance: 'Finance',
  rh: 'RH',
  marketing: 'Marketing',
  spam: 'Spam',
};

function StatsBar({ analyses }) {
  const critical = analyses.filter((a) => a.priority_level === 'critical').length;
  const high = analyses.filter((a) => a.priority_level === 'high').length;
  const decisions = analyses.filter((a) => a.decision_required).length;
  const total = analyses.length;

  return (
    <div className="grid grid-cols-4 gap-3 p-4">
      <StatCard count={total} label="Total" color="text-gray-900" bg="bg-gray-50" />
      <StatCard count={critical} label="Critiques" color="text-red-700" bg="bg-red-50" />
      <StatCard count={high} label="Importants" color="text-orange-700" bg="bg-orange-50" />
      <StatCard count={decisions} label="Décisions" color="text-purple-700" bg="bg-purple-50" />
    </div>
  );
}

function StatCard({ count, label, color, bg }) {
  return (
    <div className={`rounded-xl p-3 ${bg} text-center`}>
      <p className={`text-2xl font-bold ${color}`}>{count}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function PriorityBadge({ level }) {
  const config = PRIORITY_CONFIG[level] || PRIORITY_CONFIG.normal;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function CategoryTag({ category }) {
  const label = CATEGORY_LABELS[category] || category;
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
      {label}
    </span>
  );
}

function AnalyzedEmailRow({ analysis, email, expanded, onToggle }) {
  const date = new Date(analysis.received_at || email?.date);
  const relative = formatRelativeDate(date);

  return (
    <div className="border-b border-gray-100">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="shrink-0 mt-0.5">
          <PriorityBadge level={analysis.priority_level} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-gray-900 truncate">
              {analysis.sender_name || email?.from?.name || analysis.sender_email}
            </span>
            <span className="text-xs text-gray-400 whitespace-nowrap">{relative}</span>
          </div>
          <p className="text-sm text-gray-800 truncate">{analysis.subject}</p>
          {!expanded && analysis.summary && (
            <p className="text-sm text-gray-500 truncate mt-0.5">{analysis.summary}</p>
          )}
        </div>
        {analysis.decision_required && (
          <span className="shrink-0 mt-1 w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center" title="Décision requise">
            <svg className="w-3 h-3 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
            </svg>
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {analysis.summary && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700 mb-1">Résumé IA</p>
              <p className="text-sm text-blue-900">{analysis.summary}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {analysis.category && <CategoryTag category={analysis.category} />}
            {analysis.priority_score && (
              <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                Score : {analysis.priority_score}/10
              </span>
            )}
          </div>

          {analysis.suggested_action && (
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs font-medium text-green-700 mb-1">Action suggérée</p>
              <p className="text-sm text-green-900">{analysis.suggested_action}</p>
            </div>
          )}

          {analysis.detected_deadline && (
            <p className="text-xs text-red-600">
              Deadline : {new Date(analysis.detected_deadline).toLocaleDateString('fr-CA')}
            </p>
          )}

          {analysis.detected_amounts?.length > 0 && (
            <p className="text-xs text-gray-600">
              Montants : {analysis.detected_amounts.map((a) => `${a} $`).join(', ')}
            </p>
          )}

          {analysis.detected_people?.length > 0 && (
            <p className="text-xs text-gray-600">
              Personnes : {analysis.detected_people.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RawEmailRow({ email }) {
  const date = new Date(email.date);
  const relative = formatRelativeDate(date);
  const isUnread = email.labels?.includes('UNREAD');

  return (
    <div className="flex items-start gap-3 p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
      {isUnread && (
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" title="Non lu" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-gray-900 truncate">{email.from.name}</span>
          <span className="text-xs text-gray-400 whitespace-nowrap">{relative}</span>
        </div>
        <p className="text-sm text-gray-800 truncate">{email.subject}</p>
        <p className="text-sm text-gray-500 truncate">{email.snippet}</p>
      </div>
      {email.hasAttachments && (
        <svg className="w-4 h-4 text-gray-400 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      )}
    </div>
  );
}

function formatRelativeDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} j`;
  return date.toLocaleDateString('fr-CA');
}

export default function Dashboard({ account, onDisconnect, onOpenConfig }) {
  const { emails, loading, error: syncError, refresh } = useEmails(account);
  const { analyses, analyzing, error: analyzeError, stats, analyze } = useAnalyses(account);
  const [expandedId, setExpandedId] = useState(null);
  const [view, setView] = useState('analyzed'); // 'analyzed' | 'raw'

  // Sync emails au mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAnalyze = async () => {
    await analyze();
  };

  const error = syncError || analyzeError;
  const hasAnalyses = analyses.length > 0;

  // Map analyses par email_id pour lookup rapide
  const analysisMap = new Map(analyses.map((a) => [a.email_id, a]));

  return (
    <div className="max-w-2xl mx-auto">
      <header className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Courriels</h1>
            <p className="text-sm text-gray-500">{account.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={analyzing || loading}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {analyzing ? 'Analyse...' : 'Analyser'}
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? '...' : 'Actualiser'}
            </button>
            {onOpenConfig && (
              <button
                onClick={onOpenConfig}
                className="rounded-lg border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50"
                title="Configuration"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={onDisconnect}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Déconnecter
            </button>
          </div>
        </div>

        {/* Onglets */}
        {hasAnalyses && (
          <div className="flex gap-1 mt-3">
            <button
              onClick={() => setView('analyzed')}
              className={`px-3 py-1 rounded-lg text-sm ${view === 'analyzed' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Analysés ({analyses.length})
            </button>
            <button
              onClick={() => setView('raw')}
              className={`px-3 py-1 rounded-lg text-sm ${view === 'raw' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Tous ({emails.length})
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="m-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {analyzing && (
        <div className="p-6 text-center">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-2">Analyse IA en cours...</p>
        </div>
      )}

      {/* Vue analysée */}
      {view === 'analyzed' && hasAnalyses && !analyzing && (
        <>
          <StatsBar analyses={analyses} />
          <div>
            {analyses.map((analysis) => {
              const email = emails.find((e) => e.id === analysis.email_id);
              return (
                <AnalyzedEmailRow
                  key={analysis.email_id}
                  analysis={analysis}
                  email={email}
                  expanded={expandedId === analysis.email_id}
                  onToggle={() => setExpandedId(expandedId === analysis.email_id ? null : analysis.email_id)}
                />
              );
            })}
          </div>
        </>
      )}

      {/* Vue brute (fallback ou onglet "Tous") */}
      {(view === 'raw' || !hasAnalyses) && !analyzing && (
        <div>
          {emails.map((email) => (
            <RawEmailRow key={email.id} email={email} />
          ))}
        </div>
      )}

      {!loading && !analyzing && emails.length === 0 && !error && (
        <p className="p-8 text-center text-gray-400">Aucun courriel</p>
      )}

      {!hasAnalyses && !analyzing && emails.length > 0 && (
        <div className="p-6 text-center border-t border-gray-100">
          <p className="text-sm text-gray-500 mb-3">
            Cliquez sur « Analyser » pour obtenir les priorités et résumés IA.
          </p>
        </div>
      )}
    </div>
  );
}

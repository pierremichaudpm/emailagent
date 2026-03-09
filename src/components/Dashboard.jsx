import { useEffect } from 'react';
import { useEmails } from '../hooks/useEmails';

function PriorityBadge({ labels }) {
  const isUnread = labels.includes('UNREAD');
  return isUnread ? (
    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Non lu" />
  ) : null;
}

function EmailRow({ email }) {
  const date = new Date(email.date);
  const relative = formatRelativeDate(date);

  return (
    <div className="flex items-start gap-3 p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <PriorityBadge labels={email.labels} />
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

export default function Dashboard({ account, onDisconnect }) {
  const { emails, loading, error, refresh } = useEmails(account);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="max-w-2xl mx-auto">
      <header className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Courriels</h1>
          <p className="text-sm text-gray-500">{account.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Chargement...' : 'Actualiser'}
          </button>
          <button
            onClick={onDisconnect}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Déconnecter
          </button>
        </div>
      </header>

      {error && (
        <div className="m-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="divide-y divide-gray-100">
        {emails.map((email) => (
          <EmailRow key={email.id} email={email} />
        ))}
      </div>

      {!loading && emails.length === 0 && !error && (
        <p className="p-8 text-center text-gray-400">Aucun courriel</p>
      )}
    </div>
  );
}

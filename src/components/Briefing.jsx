import { useState, useEffect } from 'react';
import { useBriefing } from '../hooks/useBriefing';
import { getDailyQuestion, answerDailyQuestion, getEmailThread } from '../lib/api';

function formatDate() {
  const d = new Date();
  const day = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function formatRelativeDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `${diffMin} min`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD === 1) return 'Hier';
  if (diffD < 7) return `${diffD}j`;
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

function DraftPanel({ draft, emailId, onUpdate, onSend, onDismiss, onGenerate, onRefine }) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(draft.body || '');
  const [confirmSend, setConfirmSend] = useState(false);
  const [refineInput, setRefineInput] = useState('');
  const [sending, setSending] = useState(false);

  if (draft.status === 'generating') {
    return (
      <div className="mt-4 p-5 bg-brand-50 rounded-2xl border border-brand-100 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-brand-700">Rédaction en cours...</span>
        </div>
      </div>
    );
  }

  if (draft.status === 'sent') {
    return (
      <div className="mt-4 p-5 bg-emerald-50 rounded-2xl border border-emerald-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-emerald-700">Message envoyé</span>
        </div>
      </div>
    );
  }

  if (draft.status === 'saved') {
    return (
      <div className="mt-4 p-4 bg-brand-50 rounded-2xl border border-brand-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-brand-500 rounded-full" />
            <span className="text-sm font-medium text-brand-700">Brouillon sauvegardé</span>
          </div>
          <button
            onClick={() => onGenerate(emailId)}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2"
          >
            Regénérer
          </button>
        </div>
      </div>
    );
  }

  if (draft.status === 'error') {
    const isAlreadyReplied = draft.error?.includes('déjà envoyé');
    const isNotFound = draft.error?.includes('introuvable') || draft.error?.includes('not found');
    if (isAlreadyReplied || isNotFound) {
      return (
        <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-200">
          <p className="text-sm text-gray-500">
            {isAlreadyReplied ? 'Vous avez déjà répondu à ce fil.' : 'Ce courriel n\'est plus disponible.'}
          </p>
        </div>
      );
    }
    return (
      <div className="mt-4 p-4 bg-red-50 rounded-2xl border border-red-200">
        <p className="text-sm text-red-700">{draft.error}</p>
      </div>
    );
  }

  if (draft.status !== 'ready' && draft.status !== 'editing') return null;

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 overflow-hidden">
      {/* Draft header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-brand-500 rounded-full" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Brouillon</span>
          {draft.tone && (
            <span className="text-xs text-gray-400 capitalize">— {draft.tone}</span>
          )}
        </div>
        <span className="text-xs text-gray-400">À : {draft.to}</span>
      </div>

      {/* Draft body */}
      <div className="p-4">
        {editing ? (
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="w-full min-h-[200px] p-4 text-sm text-gray-800 border border-gray-200 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent leading-relaxed"
            autoFocus
          />
        ) : (
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {draft.body}
          </div>
        )}
      </div>

      {/* Refine instruction */}
      {!editing && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && refineInput.trim()) {
                  onRefine(emailId, refineInput.trim());
                  setRefineInput('');
                }
              }}
              placeholder="Plus formel, raccourcis, mentionne le budget..."
              className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400"
            />
            <button
              onClick={() => {
                if (refineInput.trim()) {
                  onRefine(emailId, refineInput.trim());
                  setRefineInput('');
                }
              }}
              disabled={!refineInput.trim()}
              className="px-4 py-2 text-sm bg-brand-50 text-brand-700 rounded-xl hover:bg-brand-100 font-medium disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              Ajuster
            </button>
          </div>
        </div>
      )}

      {/* Draft actions */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        {editing ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => { onUpdate(emailId, editBody); setEditing(false); }}
              className="px-5 py-2.5 text-sm bg-brand-500 text-white rounded-xl hover:bg-brand-600 font-medium transition-colors"
            >
              Sauvegarder
            </button>
            <button
              onClick={() => { setEditBody(draft.body); setEditing(false); }}
              className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Annuler
            </button>
          </div>
        ) : confirmSend ? (
          <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <span className="text-sm text-amber-800 flex-1">Envoyer à <strong>{draft.to}</strong> ?</span>
            <button
              onClick={async () => { setSending(true); setConfirmSend(false); try { await onSend(emailId); } finally { setSending(false); } }}
              disabled={sending || draft.status === 'sending'}
              className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {sending || draft.status === 'sending' ? 'Envoi...' : 'Confirmer'}
            </button>
            <button
              onClick={() => setConfirmSend(false)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Non
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmSend(true)}
              disabled={sending}
              className="px-5 py-2.5 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold transition-colors min-h-[44px] disabled:opacity-50"
            >
              Envoyer
            </button>
            <button
              onClick={() => { setEditBody(draft.body); setEditing(true); }}
              className="px-4 py-2.5 text-sm bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-colors min-h-[44px]"
            >
              Modifier
            </button>
            <button
              onClick={() => onDismiss(emailId)}
              className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 font-medium ml-auto"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadMessage({ msg, defaultOpen, account }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  const senderName = msg.from?.name || msg.from?.email || '';

  return (
    <div className="rounded-xl bg-stone-50 border border-stone-200/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 bg-stone-100/50 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-gray-600 truncate">
            {senderName}
          </span>
          {!open && (
            <span className="text-xs text-gray-400 truncate hidden sm:inline">
              — {(msg.body || msg.snippet || '').slice(0, 60)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400">
            {msg.date ? formatRelativeDate(msg.date) : ''}
          </span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <>
          <div className="px-3 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
            {msg.body || msg.snippet || 'Contenu non disponible'}
          </div>
          <div className="px-3 py-2 border-t border-stone-200/40">
            {saved ? (
              <span className="text-xs text-emerald-600 font-medium">Note ajoutée</span>
            ) : showNote ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && note.trim() && account) {
                      answerDailyQuestion(account.email, 'context', 'add', null,
                        `${senderName} : ${note.trim()}`
                      ).catch(() => {});
                      setShowNote(false);
                      setSaved(true);
                      setNote('');
                    }
                  }}
                  placeholder="Toujours prioriser, projet en pause..."
                  className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (note.trim() && account) {
                      answerDailyQuestion(account.email, 'context', 'add', null,
                        `${senderName} : ${note.trim()}`
                      ).catch(() => {});
                      setShowNote(false);
                      setSaved(true);
                      setNote('');
                    }
                  }}
                  disabled={!note.trim()}
                  className="px-2 py-1 text-xs bg-brand-500 text-white rounded-lg font-medium disabled:opacity-40"
                >
                  OK
                </button>
                <button onClick={() => { setShowNote(false); setNote(''); }} className="text-gray-300 hover:text-gray-500">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNote(true)}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Note
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmailCard({ analysis, draft, onGenerate, onUpdate, onSend, onDismiss, onDismissEmail, onRefine, showReplyButton, account }) {
  const [expanded, setExpanded] = useState(false);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const hasDraft = draft && draft.status !== 'idle';
  const isSent = draft?.status === 'sent';

  // Fetch thread quand on expand pour la première fois
  useEffect(() => {
    if (expanded && !thread && !threadLoading && account) {
      setThreadLoading(true);
      const tid = analysis.thread_id || analysis.email_id;
      getEmailThread(account.email, tid, account.provider)
        .then((data) => setThread(data.messages || []))
        .catch(() => setThread(null))
        .finally(() => setThreadLoading(false));
    }
  }, [expanded, thread, threadLoading, account, analysis]);

  const priorityStyles = {
    critical: {
      border: 'border-l-4 border-l-red-500',
      badge: 'bg-red-500 text-white',
      label: 'Urgent',
    },
    high: {
      border: 'border-l-4 border-l-amber-400',
      badge: 'bg-amber-500 text-white',
      label: 'Important',
    },
    normal: {
      border: 'border-l-4 border-l-blue-300',
      badge: 'bg-blue-100 text-blue-700',
      label: 'Normal',
    },
    low: {
      border: 'border-l-4 border-l-gray-200',
      badge: 'bg-gray-100 text-gray-500',
      label: 'Info',
    },
  };

  const style = priorityStyles[analysis.priority_level] || priorityStyles.normal;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-stone-200/80 ${style.border} ${isSent ? 'opacity-60' : ''} transition-all hover:shadow-md`}>
      <button
        className="w-full text-left p-4 sm:p-5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Sender line */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${style.badge}`}>
                {style.label}
              </span>
              {analysis.decision_required && !isSent && (
                <span className="w-2.5 h-2.5 bg-purple-500 rounded-full ring-2 ring-purple-200" title="Décision requise" />
              )}
              {isSent && (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Répondu
                </span>
              )}
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-base font-semibold text-gray-900 truncate">
                {analysis.sender_name || analysis.sender_email}
              </p>
              {analysis.sender_name && (
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {analysis.sender_email?.split('@')[1]}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-gray-700 mt-0.5 truncate">{analysis.subject}</p>
          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400">
              {formatRelativeDate(analysis.received_at)}
            </span>
            <svg
              className={`w-5 h-5 text-gray-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Summary - always visible */}
        <p className="text-sm text-gray-500 mt-2 line-clamp-2 leading-relaxed">{analysis.summary}</p>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          {/* Quick context note */}
          <div className="pt-3 border-t border-gray-100 mb-3">
            {!showNote && !noteSaved && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowNote(true); }}
                className="px-3 py-1.5 text-xs bg-brand-50 text-brand-700 border border-brand-100 rounded-lg font-semibold flex items-center gap-1.5 hover:bg-brand-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Ajouter une note au contexte
              </button>
            )}
            {showNote && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && note.trim()) {
                      answerDailyQuestion(account.email, 'context', 'add', null,
                        `${analysis.sender_name || analysis.sender_email} (${analysis.subject}) : ${note.trim()}`
                      ).catch(() => {});
                      setShowNote(false);
                      setNoteSaved(true);
                      setNote('');
                    }
                  }}
                  placeholder="Ex: Toujours prioriser, projet en pause, relancer..."
                  className="flex-1 px-3 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (note.trim()) {
                      answerDailyQuestion(account.email, 'context', 'add', null,
                        `${analysis.sender_name || analysis.sender_email} (${analysis.subject}) : ${note.trim()}`
                      ).catch(() => {});
                      setShowNote(false);
                      setNoteSaved(true);
                      setNote('');
                    }
                  }}
                  disabled={!note.trim()}
                  className="px-3 py-1.5 text-xs bg-brand-500 text-white rounded-lg font-medium disabled:opacity-40"
                >
                  OK
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowNote(false); setNote(''); }}
                  className="text-gray-300 hover:text-gray-500"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {noteSaved && (
              <span className="text-xs text-emerald-600 font-medium">Note ajoutée au contexte</span>
            )}
          </div>

          <div className="space-y-2">
            {analysis.suggested_action && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-brand-500 font-bold mt-0.5">→</span>
                <span className="text-gray-700">{analysis.suggested_action}</span>
              </div>
            )}
            {analysis.detected_deadline && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-red-400">⏰</span>
                <span className="text-gray-600">
                  Deadline : {new Date(analysis.detected_deadline).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}
                </span>
              </div>
            )}
            {analysis.detected_amounts?.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-amber-400">$</span>
                <span className="text-gray-600">
                  {analysis.detected_amounts.map((a) => `${Number(a).toLocaleString('fr-CA')} $`).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Thread messages */}
          {threadLoading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              Chargement du message...
            </div>
          )}
          {thread && thread.length > 0 && (
            <div className="mt-4 space-y-2">
              {thread.map((msg, i) => (
                <ThreadMessage key={i} msg={msg} defaultOpen={i === thread.length - 1} account={account} />
              ))}
            </div>
          )}

          {/* Action buttons */}
          {!hasDraft && !isSent && (
            <div className="flex items-center gap-3 mt-4">
              {showReplyButton && (
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerate(analysis.email_id); }}
                  className="px-5 py-2.5 text-sm bg-brand-500 text-white rounded-xl hover:bg-brand-600 font-semibold transition-colors shadow-sm min-h-[44px]"
                >
                  Générer une réponse
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDismissEmail(analysis.email_id); }}
                className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors min-h-[44px]"
              >
                Ignorer
              </button>
            </div>
          )}

          {/* Draft panel */}
          {hasDraft && (
            <DraftPanel
              draft={draft}
              emailId={analysis.email_id}
              onUpdate={onUpdate}
              onSend={onSend}
              onDismiss={onDismiss}
              onGenerate={onGenerate}
              onRefine={onRefine}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children, defaultOpen = false, color = 'gray' }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!count) return null;

  const colors = {
    red: 'text-red-600 bg-red-50 border-red-200',
    amber: 'text-amber-600 bg-amber-50 border-amber-200',
    gray: 'text-gray-500 bg-gray-100 border-gray-200',
  };

  return (
    <div className="mb-8">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full text-left mb-4 group"
      >
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
          {title}
        </h2>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${colors[color]}`}>
          {count}
        </span>
        <div className="flex-1 h-px bg-stone-200/60" />
        <svg
          className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

export default function Briefing({ account, onDisconnect, onOpenConfig, onOpenDecisions, onOpenDashboard }) {
  const {
    urgent, toHandle, info, stats, loading, error, drafts, refresh,
    generateDraft: onGenerate,
    updateDraft: onUpdate,
    refineDraft: onRefine,
    sendDraft: onSend,
    dismissDraft: onDismiss,
    dismissEmail: onDismissEmail,
  } = useBriefing(account);

  const [dailyQ, setDailyQ] = useState(null);
  const [dailyAnswered, setDailyAnswered] = useState(false);
  const [dailyInput, setDailyInput] = useState('');
  const [showContextNote, setShowContextNote] = useState(false);
  const [contextNote, setContextNote] = useState('');
  const [contextSaved, setContextSaved] = useState(false);

  // Charger la question du jour une fois les analyses chargées
  useEffect(() => {
    if (!account || loading || dailyAnswered) return;
    getDailyQuestion(account.email)
      .then((data) => { if (data.question) setDailyQ(data.question); })
      .catch(() => {});
  }, [account, loading, dailyAnswered]);

  async function handleDailyAnswer(answer) {
    if (!dailyQ || !account) return;
    try {
      await answerDailyQuestion(
        account.email,
        dailyQ.type,
        answer,
        dailyQ.sender_email || null,
        dailyQ.type === 'context' ? dailyInput || answer : null
      );
    } catch {}
    setDailyAnswered(true);
  }

  const userName = account.email?.split('@')[0]?.split('.')[0];
  const greeting = new Date().getHours() < 12 ? 'Bonjour' : new Date().getHours() < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <div className="max-w-2xl mx-auto pb-12">
      {/* Header */}
      <header className="px-4 sm:px-6 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {greeting}{userName ? `, ${userName.charAt(0).toUpperCase() + userName.slice(1)}` : ''}
            </h1>
            <p className="text-sm text-gray-400 mt-1">{formatDate()}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refresh(false)}
              disabled={loading}
              className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px]"
              title="Actualiser"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {onOpenConfig && (
              <button
                onClick={onOpenConfig}
                className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors min-h-[44px] min-w-[44px]"
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
              className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors min-h-[44px] min-w-[44px]"
              title="Déconnecter"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats summary */}
        {!loading && (stats.urgent > 0 || stats.toHandle > 0 || stats.info > 0) && (
          <div className="mt-4 flex items-center gap-3">
            {stats.urgent > 0 && (
              <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1.5 rounded-xl text-sm font-semibold border border-red-100">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                {stats.urgent} urgence{stats.urgent > 1 ? 's' : ''}
              </div>
            )}
            {stats.toHandle > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl text-sm font-semibold border border-amber-100">
                {stats.toHandle} à traiter
              </div>
            )}
            {stats.info > 0 && (
              <div className="text-sm text-gray-400 font-medium">
                {stats.info} info
              </div>
            )}
          </div>
        )}
        {/* Legend */}
        {!loading && (stats.urgent > 0 || stats.toHandle > 0) && (
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-purple-500 rounded-full" /> Décision requise
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Répondu
            </span>
          </div>
        )}
      </header>

      {/* Daily improvement question */}
      {dailyQ && !dailyAnswered && !loading && (
        <div className="mx-4 sm:mx-6 mb-4 p-4 bg-white rounded-2xl border border-brand-100 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-brand-500 text-sm">💡</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 leading-relaxed">{dailyQ.question}</p>
              {dailyQ.type === 'context' ? (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={dailyInput}
                    onChange={(e) => setDailyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && dailyInput.trim() && handleDailyAnswer(dailyInput.trim())}
                    placeholder="Votre réponse..."
                    className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => dailyInput.trim() && handleDailyAnswer(dailyInput.trim())}
                    disabled={!dailyInput.trim()}
                    className="px-4 py-2 text-sm bg-brand-500 text-white rounded-xl font-medium disabled:opacity-40"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {(dailyQ.options || ['Oui, prioritaire', 'Non, info seulement', 'Ignorer']).map((opt, i) => {
                    const answers = ['critical', 'priority', 'ignore'];
                    return (
                      <button
                        key={i}
                        onClick={() => handleDailyAnswer(answers[i] || opt)}
                        className={`px-3 py-1.5 text-sm rounded-xl font-medium transition-colors ${
                          i === 0
                            ? 'bg-brand-500 text-white hover:bg-brand-600'
                            : 'bg-stone-100 text-gray-600 hover:bg-stone-200'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => setDailyAnswered(true)}
              className="text-gray-300 hover:text-gray-500 p-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {dailyAnswered && !loading && (
        <div className="mx-4 sm:mx-6 mb-4 p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-center">
          <p className="text-sm text-emerald-700 font-medium">Merci ! Votre configuration a été mise à jour.</p>
        </div>
      )}

      {/* Quick context note */}
      {!loading && (
        <div className="mx-4 sm:mx-6 mb-4">
          {!showContextNote ? (
            <button
              onClick={() => setShowContextNote(true)}
              className="text-sm text-gray-400 hover:text-brand-600 font-medium transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter du contexte pour aujourd'hui
            </button>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Note de contexte</span>
                <button onClick={() => setShowContextNote(false)} className="text-gray-300 hover:text-gray-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <textarea
                value={contextNote}
                onChange={(e) => setContextNote(e.target.value)}
                placeholder="Ex: Cette semaine je suis en deadline sur SILA. Je suis en vacances du 20 au 27. Le projet BBR est en pause..."
                className="w-full min-h-[80px] p-3 text-sm border border-stone-200 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400 leading-relaxed"
                autoFocus
              />
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={async () => {
                    if (!contextNote.trim() || !account) return;
                    try {
                      await answerDailyQuestion(account.email, 'context', 'add', null, contextNote.trim());
                      setContextSaved(true);
                      setTimeout(() => { setContextSaved(false); setShowContextNote(false); setContextNote(''); }, 2000);
                    } catch {}
                  }}
                  disabled={!contextNote.trim()}
                  className="px-5 py-2 text-sm bg-brand-500 text-white rounded-xl font-medium hover:bg-brand-600 disabled:opacity-40 transition-colors"
                >
                  Sauvegarder
                </button>
                {contextSaved && (
                  <span className="text-sm text-emerald-600 font-medium">Ajouté au contexte !</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 sm:mx-6 mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 mt-4 font-medium">Analyse de vos courriels...</p>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <div className="px-4 sm:px-6 pt-2">
          <Section title="Urgences" count={stats.urgent} defaultOpen={true} color="red">
            {urgent.map((a) => (
              <EmailCard
                key={a.email_id}
                analysis={a}
                draft={drafts.get(a.email_id)}
                account={account}
                onGenerate={onGenerate}
                onUpdate={onUpdate}
                onSend={onSend}
                onDismiss={onDismiss}
                onDismissEmail={onDismissEmail}
                onRefine={onRefine}
                showReplyButton={true}
              />
            ))}
          </Section>

          <Section title="À traiter" count={stats.toHandle} defaultOpen={true} color="amber">
            {toHandle.map((a) => (
              <EmailCard
                key={a.email_id}
                analysis={a}
                draft={drafts.get(a.email_id)}
                account={account}
                onGenerate={onGenerate}
                onUpdate={onUpdate}
                onSend={onSend}
                onDismiss={onDismiss}
                onDismissEmail={onDismissEmail}
                onRefine={onRefine}
                showReplyButton={true}
              />
            ))}
          </Section>

          <Section title="Information" count={stats.info} defaultOpen={false} color="gray">
            {info.map((a) => (
              <EmailCard
                key={a.email_id}
                analysis={a}
                draft={drafts.get(a.email_id)}
                account={account}
                onGenerate={onGenerate}
                onUpdate={onUpdate}
                onSend={onSend}
                onDismiss={onDismiss}
                onDismissEmail={onDismissEmail}
                onRefine={onRefine}
                showReplyButton={false}
              />
            ))}
          </Section>

          {stats.urgent === 0 && stats.toHandle === 0 && stats.info === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-4">☀️</div>
              <p className="text-lg font-semibold text-gray-700">Rien d'urgent ce matin</p>
              <p className="text-sm text-gray-400 mt-1">Tous vos courriels sont traités.</p>
              <button
                onClick={() => refresh(false)}
                className="mt-6 px-5 py-2.5 text-sm bg-brand-500 text-white rounded-xl hover:bg-brand-600 font-medium transition-colors"
              >
                Vérifier à nouveau
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

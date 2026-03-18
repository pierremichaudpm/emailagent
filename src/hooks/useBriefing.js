import { useState, useCallback, useEffect } from 'react';
import { analyzeEmails, generateDraft, sendDraft, updateDraft, dismissEmail, refineDraft, answerDailyQuestion } from '../lib/api';

export function useBriefing(account) {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState(new Map());
  const [dismissed, setDismissed] = useState(new Set());

  // Charger et analyser au mount
  const refresh = useCallback(async (forceRefresh = false) => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const opts = { maxResults: '20' };
      if (forceRefresh) opts.refresh = 'true';
      const data = await analyzeEmails(account.email, account.provider, opts);
      const sorted = [...(data.analyses || [])].sort(
        (a, b) => (b.priority_score || 0) - (a.priority_score || 0)
      );
      setAnalyses(sorted);
      // Restaurer les brouillons existants depuis les analyses (body/subject/to persistés en DB)
      const restoredDrafts = new Map();
      for (const a of sorted) {
        if (a.draft_id) {
          restoredDrafts.set(a.email_id, {
            status: a.draft_body ? 'ready' : 'saved',
            draftId: a.draft_id,
            body: a.draft_body || null,
            subject: a.draft_subject || null,
            to: a.draft_to || null,
          });
        }
      }
      setDrafts(restoredDrafts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Séparer : actionnable vs déjà traité vs automatique vs ignoré
  const actionable = analyses.filter((a) => !a.user_replied && !a.is_automatic && !dismissed.has(a.email_id));
  const automatic = analyses.filter((a) => a.is_automatic);

  // Trier en 3 groupes (seulement les emails qui nécessitent une action humaine)
  const urgent = actionable.filter((a) => a.priority_level === 'critical');
  const toHandle = actionable.filter((a) => a.priority_level === 'high');
  // Info = normal/low actionnables + tous les automatiques
  const info = [
    ...actionable.filter((a) => a.priority_level === 'normal' || a.priority_level === 'low'),
    ...automatic,
  ];

  const stats = {
    urgent: urgent.length,
    toHandle: toHandle.length,
    info: info.length,
  };

  // Gestion des brouillons
  const setDraftState = (emailId, state) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(emailId, { ...prev.get(emailId), ...state });
      return next;
    });
  };

  const handleGenerateDraft = useCallback(
    async (emailId) => {
      if (!account) return;
      setDraftState(emailId, { status: 'generating' });
      try {
        const data = await generateDraft(account.email, emailId, account.provider);
        setDraftState(emailId, {
          status: 'ready',
          draftId: data.draftId,
          body: data.body,
          subject: data.subject,
          tone: data.tone,
          to: data.to,
        });
      } catch (err) {
        setDraftState(emailId, { status: 'error', error: err.message });
      }
    },
    [account]
  );

  const handleUpdateDraft = useCallback(
    async (emailId, newBody) => {
      if (!account) return;
      const draft = drafts.get(emailId);
      if (!draft?.draftId) return;

      setDraftState(emailId, { status: 'editing', body: newBody });

      try {
        const analysis = analyses.find((a) => a.email_id === emailId);
        const data = await updateDraft(account.email, draft.draftId, account.provider, {
          emailId,
          body: newBody,
          subject: draft.subject,
          to: draft.to,
          threadId: analysis?.thread_id,
          inReplyTo: `<${emailId}>`,
          references: `<${emailId}>`,
        });
        setDraftState(emailId, { status: 'ready', draftId: data.draftId, body: newBody });
      } catch (err) {
        setDraftState(emailId, { status: 'error', error: err.message });
      }
    },
    [account, drafts, analyses]
  );

  const handleSendDraft = useCallback(
    async (emailId) => {
      if (!account) return;
      const draft = drafts.get(emailId);
      if (!draft?.draftId || draft.status === 'sending' || draft.status === 'sent') return;

      setDraftState(emailId, { status: 'sending' });
      try {
        await sendDraft(account.email, draft.draftId, emailId, account.provider);
        setDraftState(emailId, { status: 'sent' });
      } catch (err) {
        setDraftState(emailId, { status: 'error', error: err.message });
      }
    },
    [account, drafts]
  );

  const handleRefineDraft = useCallback(
    async (emailId, instruction) => {
      if (!account) return;
      const draft = drafts.get(emailId);
      if (!draft?.body) return;

      setDraftState(emailId, { status: 'generating' });
      try {
        const data = await refineDraft(
          account.email, emailId, draft.draftId,
          instruction, draft.body, draft.subject, draft.tone,
          account.provider
        );
        setDraftState(emailId, {
          status: 'ready',
          draftId: data.draftId,
          body: data.body,
          subject: data.subject,
          tone: data.tone,
          to: data.to,
        });
      } catch (err) {
        setDraftState(emailId, { status: 'error', error: err.message });
      }
    },
    [account, drafts]
  );

  const handleDismissDraft = useCallback((emailId) => {
    setDraftState(emailId, { status: 'idle' });
  }, []);

  const handleDismissEmail = useCallback(
    async (emailId) => {
      setDismissed((prev) => new Set([...prev, emailId]));
      if (account) {
        try {
          await dismissEmail(account.email, emailId, account.provider);
        } catch {}
      }
    },
    [account]
  );

  return {
    analyses,
    urgent,
    toHandle,
    info,
    stats,
    loading,
    error,
    drafts,
    refresh,
    generateDraft: handleGenerateDraft,
    updateDraft: handleUpdateDraft,
    refineDraft: handleRefineDraft,
    sendDraft: handleSendDraft,
    dismissDraft: handleDismissDraft,
    dismissEmail: handleDismissEmail,
  };
}

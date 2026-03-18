import { useState, useEffect, useRef } from 'react';
import { launchProfileGeneration, pollProfileStatus } from '../lib/api';

export const DEFAULT_KEYWORDS = [
  { keywords: ['urgent', 'deadline', 'échéance', 'immédiat'], level: 'critical', enabled: true },
  { keywords: ['approbation', 'autorisation', 'approuver'], level: 'high', enabled: true },
  { keywords: ['facture', 'paiement', 'montant', 'contrat'], level: 'high', enabled: true },
];

export function StepContext({ context, onChange, account }) {
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const pollRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await pollProfileStatus(account.email);
        setGenStatus(data.progress || '');

        if (data.status === 'done') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setGenerating(false);
          if (data.context) onChange(data.context);
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setGenerating(false);
          setGenStatus(`Erreur : ${data.progress}`);
        }
      } catch {}
    }, 3000);
  }

  async function handleAutoGenerate() {
    if (!account) return;
    setGenerating(true);
    setGenStatus('Démarrage...');
    onChange('');

    try {
      await launchProfileGeneration(account.email, account.provider);
      startPolling();
    } catch (err) {
      setGenStatus(`Erreur : ${err.message}`);
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Votre contexte professionnel</h2>
      <p className="text-gray-600">
        Plus le contexte est riche, plus les réponses IA seront pertinentes.
        Vous pouvez le rédiger manuellement ou le générer automatiquement à partir de vos courriels.
      </p>

      {account && (
        <button
          onClick={handleAutoGenerate}
          disabled={generating}
          className="w-full py-3 rounded-xl border-2 border-dashed border-brand-500/40 text-brand-600 hover:bg-brand-50 disabled:opacity-50 font-medium text-sm"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              {genStatus}
            </span>
          ) : (
            'Générer mon profil automatiquement à partir de mes courriels'
          )}
        </button>
      )}

      {genStatus && !generating && (
        <p className="text-sm text-green-600">{genStatus}</p>
      )}

      <textarea
        value={context}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
        className="w-full rounded-xl border border-stone-200 p-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        placeholder={"Ex: Je suis Virginie Jaffredo, productrice numérique et présidente de JAXA Production inc., basée à Montréal...\n\nOu cliquez le bouton ci-dessus pour générer automatiquement."}
      />
    </div>
  );
}

export function StepSenders({ senders, onChange }) {
  function addSender() {
    onChange([...senders, { address: '', level: 'high', label: '' }]);
  }

  function updateSender(index, field, value) {
    const updated = senders.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange(updated);
  }

  function removeSender(index) {
    onChange(senders.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Expéditeurs prioritaires</h2>
      <p className="text-gray-600">
        Ajoutez les domaines ou adresses de vos contacts les plus importants.
        Les courriels de ces expéditeurs seront automatiquement priorisés.
      </p>

      <div className="space-y-3">
        {senders.map((sender, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-stone-50">
            <input
              type="text"
              value={sender.address}
              onChange={(e) => updateSender(i, 'address', e.target.value)}
              placeholder="ex: ville.montreal.qc.ca"
              className="flex-1 min-w-[180px] rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <input
              type="text"
              value={sender.label}
              onChange={(e) => updateSender(i, 'label', e.target.value)}
              placeholder="Label (optionnel)"
              className="flex-1 min-w-[140px] rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <select
              value={sender.level}
              onChange={(e) => updateSender(i, 'level', e.target.value)}
              className="rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="critical">Critique</option>
              <option value="high">Important</option>
            </select>
            <button
              onClick={() => removeSender(i)}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              title="Retirer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addSender}
        className="inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-700 font-medium"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Ajouter un expéditeur
      </button>
    </div>
  );
}

export function StepKeywords({ keywordGroups, onChange, customKeyword, onCustomKeywordChange, onAddCustom }) {
  function toggleGroup(index) {
    const updated = keywordGroups.map((g, i) =>
      i === index ? { ...g, enabled: !g.enabled } : g
    );
    onChange(updated);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Mots-clés déclencheurs</h2>
      <p className="text-gray-600">
        Ces mots-clés, quand détectés dans un courriel, déclenchent un drapeau de priorité.
        Activez ou désactivez les groupes selon votre réalité.
      </p>

      <div className="space-y-3">
        {keywordGroups.map((group, i) => (
          <button
            key={i}
            onClick={() => toggleGroup(i)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              group.enabled
                ? 'border-brand-500/40 bg-brand-50'
                : 'border-gray-200 bg-gray-50 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${
                    group.level === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {group.level === 'critical' ? 'Critique' : 'Important'}
                </span>
                <span className="text-sm text-gray-700">
                  {group.keywords.join(', ')}
                </span>
              </div>
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  group.enabled ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                }`}
              >
                {group.enabled && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={customKeyword}
          onChange={(e) => onCustomKeywordChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAddCustom()}
          placeholder="Ajouter un mot-clé..."
          className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <button
          onClick={onAddCustom}
          disabled={!customKeyword.trim()}
          className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

export function StepThresholds({ amountThreshold, staleDays, onAmountChange, onDaysChange }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Seuils de détection</h2>
      <p className="text-gray-600">
        Ces paramètres ajustent la sensibilité de l'analyse. Vous pourrez les modifier à tout moment.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seuil de montant ($)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Les courriels mentionnant un montant supérieur à ce seuil seront marqués comme importants.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amountThreshold}
              onChange={(e) => onAmountChange(Number(e.target.value))}
              min={0}
              step={500}
              className="w-32 rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-500">$</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Jours avant « en retard »
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Un courriel en attente de réponse depuis plus de ce nombre de jours sera marqué en retard.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={staleDays}
              onChange={(e) => onDaysChange(Number(e.target.value))}
              min={1}
              max={30}
              className="w-32 rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-500">jours</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Convertit la config Supabase en état local pour les formulaires.
 */
export function configToFormState(config) {
  // Expéditeurs : { email: { level, label } } → [{ address, level, label }]
  const senders = [];
  if (config.sender_priorities) {
    for (const [address, value] of Object.entries(config.sender_priorities)) {
      if (typeof value === 'object') {
        senders.push({ address, level: value.level || 'high', label: value.label || '' });
      } else {
        senders.push({ address, level: value, label: '' });
      }
    }
  }
  if (senders.length === 0) senders.push({ address: '', level: 'high', label: '' });

  // Mots-clés : [{ keywords, level }] → [{ keywords, level, enabled }]
  let keywordGroups = DEFAULT_KEYWORDS.map((g) => ({ ...g }));
  if (config.keyword_flags && Array.isArray(config.keyword_flags)) {
    keywordGroups = config.keyword_flags.map((g) => ({
      keywords: g.keywords || [g],
      level: g.level || 'high',
      enabled: true,
    }));
  }

  return {
    context: config.context || '',
    senders,
    keywordGroups,
    amountThreshold: config.amount_threshold ?? 5000,
    staleDays: config.stale_days ?? 5,
  };
}

/**
 * Convertit l'état du formulaire en config pour Supabase.
 */
export function formStateToConfig({ context, senders, keywordGroups, amountThreshold, staleDays }) {
  const senderPriorities = {};
  for (const s of senders) {
    if (s.address.trim()) {
      senderPriorities[s.address.trim()] = {
        level: s.level,
        label: s.label || s.address.trim(),
      };
    }
  }

  const keywordFlags = keywordGroups
    .filter((g) => g.enabled)
    .map(({ keywords, level }) => ({ keywords, level }));

  return {
    context,
    sender_priorities: senderPriorities,
    keyword_flags: keywordFlags,
    amount_threshold: amountThreshold,
    stale_days: staleDays,
  };
}

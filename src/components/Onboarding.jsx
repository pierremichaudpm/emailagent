import { useState } from 'react';

const DEFAULT_KEYWORDS = [
  { keywords: ['urgent', 'deadline', 'échéance', 'immédiat'], level: 'critical', enabled: true },
  { keywords: ['approbation', 'autorisation', 'approuver'], level: 'high', enabled: true },
  { keywords: ['facture', 'paiement', 'montant', 'contrat'], level: 'high', enabled: true },
];

const STEPS = ['Contexte', 'Expéditeurs', 'Mots-clés', 'Seuils'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              i <= current ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 ${i < current ? 'bg-blue-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function StepContext({ context, onChange }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Votre contexte professionnel</h2>
      <p className="text-gray-600">
        Décrivez brièvement votre rôle. Cette information aide l'IA à mieux comprendre vos courriels
        et à personnaliser ses suggestions.
      </p>
      <textarea
        value={context}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-gray-300 p-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        placeholder="Ex: Je suis gestionnaire de production chez JAXA Production. Je coordonne des événements avec la Ville de Montréal, des commanditaires et des fournisseurs techniques."
      />
    </div>
  );
}

function StepSenders({ senders, onChange }) {
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
          <div key={i} className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-gray-50">
            <input
              type="text"
              value={sender.address}
              onChange={(e) => updateSender(i, 'address', e.target.value)}
              placeholder="ex: ville.montreal.qc.ca"
              className="flex-1 min-w-[180px] rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              value={sender.label}
              onChange={(e) => updateSender(i, 'label', e.target.value)}
              placeholder="Label (optionnel)"
              className="flex-1 min-w-[140px] rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={sender.level}
              onChange={(e) => updateSender(i, 'level', e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Ajouter un expéditeur
      </button>
    </div>
  );
}

function StepKeywords({ keywordGroups, onChange, customKeyword, onCustomKeywordChange, onAddCustom }) {
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
                ? 'border-blue-300 bg-blue-50'
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
                  group.enabled ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
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
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={onAddCustom}
          disabled={!customKeyword.trim()}
          className="rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

function StepThresholds({ amountThreshold, staleDays, onAmountChange, onDaysChange }) {
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
              className="w-32 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
              className="w-32 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">jours</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Onboarding({ account, onComplete }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [context, setContext] = useState('');

  // Step 2
  const [senders, setSenders] = useState([{ address: '', level: 'high', label: '' }]);

  // Step 3
  const [keywordGroups, setKeywordGroups] = useState(DEFAULT_KEYWORDS);
  const [customKeyword, setCustomKeyword] = useState('');

  // Step 4
  const [amountThreshold, setAmountThreshold] = useState(5000);
  const [staleDays, setStaleDays] = useState(5);

  function addCustomKeyword() {
    const word = customKeyword.trim();
    if (!word) return;
    setKeywordGroups([...keywordGroups, { keywords: [word], level: 'high', enabled: true }]);
    setCustomKeyword('');
  }

  function buildConfig() {
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

  async function handleFinish() {
    setSaving(true);
    try {
      const config = buildConfig();
      await onComplete(config);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-12 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configuration initiale</h1>
          <p className="text-sm text-gray-500 mt-1">{account.email}</p>
        </div>

        <StepIndicator current={step} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {step === 0 && <StepContext context={context} onChange={setContext} />}
          {step === 1 && <StepSenders senders={senders} onChange={setSenders} />}
          {step === 2 && (
            <StepKeywords
              keywordGroups={keywordGroups}
              onChange={setKeywordGroups}
              customKeyword={customKeyword}
              onCustomKeywordChange={setCustomKeyword}
              onAddCustom={addCustomKeyword}
            />
          )}
          {step === 3 && (
            <StepThresholds
              amountThreshold={amountThreshold}
              staleDays={staleDays}
              onAmountChange={setAmountThreshold}
              onDaysChange={setStaleDays}
            />
          )}

          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(step - 1)}
              disabled={step === 0}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-0"
            >
              Précédent
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Suivant
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Terminer'}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Vous pourrez modifier ces paramètres à tout moment.
        </p>
      </div>
    </div>
  );
}

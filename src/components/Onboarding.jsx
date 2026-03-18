import { useState } from 'react';
import {
  DEFAULT_KEYWORDS,
  StepContext,
  StepSenders,
  StepKeywords,
  StepThresholds,
  formStateToConfig,
} from './ConfigSteps';

const STEPS = ['Contexte', 'Expéditeurs', 'Mots-clés', 'Seuils'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              i <= current ? 'bg-brand-500 text-white' : 'bg-stone-200 text-gray-400'
            }`}
          >
            {i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 ${i < current ? 'bg-brand-500' : 'bg-stone-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Onboarding({ account, onComplete }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [context, setContext] = useState('');
  const [senders, setSenders] = useState([{ address: '', level: 'high', label: '' }]);
  const [keywordGroups, setKeywordGroups] = useState(DEFAULT_KEYWORDS);
  const [customKeyword, setCustomKeyword] = useState('');
  const [amountThreshold, setAmountThreshold] = useState(5000);
  const [staleDays, setStaleDays] = useState(5);

  function addCustomKeyword() {
    const word = customKeyword.trim();
    if (!word) return;
    setKeywordGroups([...keywordGroups, { keywords: [word], level: 'high', enabled: true }]);
    setCustomKeyword('');
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      const config = formStateToConfig({ context, senders, keywordGroups, amountThreshold, staleDays });
      await onComplete(config);
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'enregistrement');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-12 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configuration initiale</h1>
          <p className="text-sm text-gray-500 mt-1">{account.email}</p>
        </div>

        <StepIndicator current={step} />

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 p-6 sm:p-8">
          {step === 0 && <StepContext context={context} onChange={setContext} account={account} />}
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

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
          )}

          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(step - 1)}
              disabled={step === 0}
              className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-0 transition-colors"
            >
              Précédent
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
              >
                Suivant
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
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

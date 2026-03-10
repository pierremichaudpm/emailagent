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

export default function Onboarding({ account, onComplete }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

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
    try {
      const config = formStateToConfig({ context, senders, keywordGroups, amountThreshold, staleDays });
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

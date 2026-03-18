import { useState, useEffect } from 'react';
import {
  StepContext,
  StepSenders,
  StepKeywords,
  StepThresholds,
  configToFormState,
  formStateToConfig,
} from './ConfigSteps';

const TABS = [
  { id: 'context', label: 'Contexte' },
  { id: 'senders', label: 'Expéditeurs' },
  { id: 'keywords', label: 'Mots-clés' },
  { id: 'thresholds', label: 'Seuils' },
];

export default function ConfigPanel({ config, account, onSave, onClose }) {
  const [activeTab, setActiveTab] = useState('context');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const initial = configToFormState(config);
  const [context, setContext] = useState(initial.context);
  const [senders, setSenders] = useState(initial.senders);
  const [keywordGroups, setKeywordGroups] = useState(initial.keywordGroups);
  const [customKeyword, setCustomKeyword] = useState('');
  const [amountThreshold, setAmountThreshold] = useState(initial.amountThreshold);
  const [staleDays, setStaleDays] = useState(initial.staleDays);

  function addCustomKeyword() {
    const word = customKeyword.trim();
    if (!word) return;
    setKeywordGroups([...keywordGroups, { keywords: [word], level: 'high', enabled: true }]);
    setCustomKeyword('');
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const newConfig = formStateToConfig({ context, senders, keywordGroups, amountThreshold, staleDays });
      await onSave(newConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-sm border-b border-stone-200/60 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
          <h1 className="text-lg font-bold text-gray-900">Configuration</h1>
          <button
            onClick={onClose}
            className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-gray-600 hover:bg-white font-medium transition-colors"
          >
            Retour
          </button>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 flex gap-1 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 p-6 sm:p-8">
          {activeTab === 'context' && (
            <StepContext context={context} onChange={setContext} account={account} />
          )}
          {activeTab === 'senders' && (
            <StepSenders senders={senders} onChange={setSenders} />
          )}
          {activeTab === 'keywords' && (
            <StepKeywords
              keywordGroups={keywordGroups}
              onChange={setKeywordGroups}
              customKeyword={customKeyword}
              onCustomKeywordChange={setCustomKeyword}
              onAddCustom={addCustomKeyword}
            />
          )}
          {activeTab === 'thresholds' && (
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

          <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-stone-100">
            {saved && (
              <span className="text-sm text-emerald-600 font-semibold">Enregistré</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

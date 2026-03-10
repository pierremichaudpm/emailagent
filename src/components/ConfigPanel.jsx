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

export default function ConfigPanel({ config, onSave, onClose }) {
  const [activeTab, setActiveTab] = useState('context');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Initialiser depuis la config existante
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
    try {
      const newConfig = formStateToConfig({ context, senders, keywordGroups, amountThreshold, staleDays });
      await onSave(newConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // erreur gérée en amont
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto flex items-center justify-between p-4">
          <h1 className="text-lg font-semibold text-gray-900">Configuration</h1>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Retour
          </button>
        </div>

        {/* Onglets */}
        <div className="max-w-2xl mx-auto px-4 flex gap-1 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {activeTab === 'context' && (
            <StepContext context={context} onChange={setContext} />
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

          <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
            {saved && (
              <span className="text-sm text-green-600 font-medium">Enregistré</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

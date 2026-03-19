import { useState } from 'react';
import { StepContext, configToFormState, formStateToConfig } from './ConfigSteps';

export default function ConfigPanel({ config, account, onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const initial = configToFormState(config);
  const [context, setContext] = useState(initial.context);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const newConfig = formStateToConfig({
        context,
        senders: initial.senders,
        keywordGroups: initial.keywordGroups,
        amountThreshold: initial.amountThreshold,
        staleDays: initial.staleDays,
      });
      await onSave(newConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-sm border-b border-stone-200/60 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
          <h1 className="text-lg font-bold text-gray-900">Mon contexte</h1>
          <button
            onClick={onClose}
            className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-gray-600 hover:bg-white font-medium transition-colors min-h-[44px]"
          >
            Retour
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 p-6 sm:p-8">
          <StepContext context={context} onChange={setContext} account={account} />

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
              className="rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

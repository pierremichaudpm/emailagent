import { useState } from 'react';
import { useAccount } from './hooks/useAccount';
import { useConfig } from './hooks/useConfig';
import AuthButton from './components/AuthButton';
import Briefing from './components/Briefing';
import Dashboard from './components/Dashboard';
import Onboarding from './components/Onboarding';
import ConfigPanel from './components/ConfigPanel';
import DecisionTracker from './components/DecisionTracker';

export default function App() {
  const { account, disconnect } = useAccount();
  const { config, configLoading, saveConfig } = useConfig(account);
  const [view, setView] = useState('briefing'); // 'briefing' | 'dashboard' | 'config' | 'decisions'

  if (!account) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-8 p-8 max-w-sm">
          <div>
            <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Agent Courriel</h1>
            <p className="text-sm text-gray-500 mt-2">par JAXA Production</p>
          </div>
          <p className="text-gray-600 text-sm leading-relaxed">
            Votre assistant email intelligent. Analyse, tri et réponses générées par IA.
          </p>
          <AuthButton />
        </div>
      </div>
    );
  }

  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return <Onboarding account={account} onComplete={saveConfig} />;
  }

  if (view === 'config') {
    return (
      <ConfigPanel
        key={config?.updated_at || 'config'}
        config={config}
        account={account}
        onSave={saveConfig}
        onClose={() => setView('briefing')}
      />
    );
  }

  if (view === 'decisions') {
    return (
      <DecisionTracker
        account={account}
        onBack={() => setView('briefing')}
      />
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen">
        <Dashboard
          account={account}
          onDisconnect={disconnect}
          onOpenConfig={() => setView('config')}
          onOpenDecisions={() => setView('decisions')}
          onOpenBriefing={() => setView('briefing')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Briefing
        account={account}
        onDisconnect={disconnect}
        onOpenConfig={() => setView('config')}
        onOpenDecisions={() => setView('decisions')}
        onOpenDashboard={() => setView('dashboard')}
      />
    </div>
  );
}

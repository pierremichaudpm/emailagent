import { useState } from 'react';
import { useAccount } from './hooks/useAccount';
import { useConfig } from './hooks/useConfig';
import AuthButton from './components/AuthButton';
import Dashboard from './components/Dashboard';
import Onboarding from './components/Onboarding';
import ConfigPanel from './components/ConfigPanel';
import DecisionTracker from './components/DecisionTracker';

export default function App() {
  const { account, disconnect } = useAccount();
  const { config, configLoading, saveConfig } = useConfig(account);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'config' | 'decisions'

  if (!account) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-6 p-8">
          <h1 className="text-2xl font-bold text-gray-900">Agent Courriel</h1>
          <p className="text-gray-600 max-w-md">
            Connectez votre compte Gmail pour commencer l'analyse de vos courriels.
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
        config={config}
        onSave={saveConfig}
        onClose={() => setView('dashboard')}
      />
    );
  }

  if (view === 'decisions') {
    return (
      <DecisionTracker
        account={account}
        onBack={() => setView('dashboard')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Dashboard
        account={account}
        onDisconnect={disconnect}
        onOpenConfig={() => setView('config')}
        onOpenDecisions={() => setView('decisions')}
      />
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { formStateToConfig, DEFAULT_KEYWORDS } from './ConfigSteps';
import { launchProfileGeneration, pollProfileStatus } from '../lib/api';

export default function Onboarding({ account, onComplete }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Profile generation
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const [profileReady, setProfileReady] = useState(false);
  const [generatedContext, setGeneratedContext] = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startProfileGeneration() {
    setGenerating(true);
    setGenStatus('Lancement...');
    try {
      await launchProfileGeneration(account.email, account.provider);
      pollRef.current = setInterval(async () => {
        try {
          const data = await pollProfileStatus(account.email);
          setGenStatus(data.progress || 'Analyse en cours...');
          if (data.status === 'done') {
            clearInterval(pollRef.current);
            setGenerating(false);
            setProfileReady(true);
            setGeneratedContext(data.context || '');
          } else if (data.status === 'error') {
            clearInterval(pollRef.current);
            setGenerating(false);
            setError('Erreur lors de la génération du profil');
          }
        } catch {
          clearInterval(pollRef.current);
          setGenerating(false);
        }
      }, 3000);
    } catch {
      setGenerating(false);
      setError('Impossible de lancer la génération');
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      const config = formStateToConfig({
        context: generatedContext,
        senders: [],
        keywordGroups: DEFAULT_KEYWORDS,
        amountThreshold: 5000,
        staleDays: 5,
      });
      await onComplete(config);
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-brand-500' : i < step ? 'w-2 bg-brand-400' : 'w-2 bg-stone-300'
              }`}
            />
          ))}
        </div>

        {/* Step 0: How it works */}
        {step === 0 && (
          <div className="bg-white rounded-3xl shadow-sm border border-stone-200/80 p-8 text-center">
            <div className="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Votre assistant email</h2>
            <p className="text-gray-500 leading-relaxed mb-8">
              Chaque matin, votre assistant trie vos courriels par urgence,
              vous propose des réponses et vous permet d'envoyer en un clic.
            </p>

            <div className="space-y-4 text-left mb-8">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">🔴</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Urgences en premier</p>
                  <p className="text-xs text-gray-500">L'IA identifie ce qui nécessite votre attention immédiate</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">✍️</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Réponses suggérées</p>
                  <p className="text-xs text-gray-500">Un brouillon prêt à envoyer, dans votre ton habituel</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">✅</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Vous validez, on envoie</p>
                  <p className="text-xs text-gray-500">Rien ne part sans votre approbation</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(1)}
              className="w-full py-3.5 bg-brand-500 text-white rounded-2xl font-semibold hover:bg-brand-600 transition-colors text-sm min-h-[44px]"
            >
              Continuer
            </button>
          </div>
        )}

        {/* Step 1: Profile generation */}
        {step === 1 && (
          <div className="bg-white rounded-3xl shadow-sm border border-stone-200/80 p-8 text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">On apprend à vous connaître</h2>
            <p className="text-gray-500 leading-relaxed mb-8">
              L'assistant analyse vos 2000 derniers courriels pour comprendre vos projets,
              vos contacts et votre style de communication.
            </p>

            {!generating && !profileReady && (
              <button
                onClick={startProfileGeneration}
                className="w-full py-3.5 bg-brand-500 text-white rounded-2xl font-semibold hover:bg-brand-600 transition-colors text-sm min-h-[44px]"
              >
                Analyser mes courriels
              </button>
            )}

            {generating && (() => {
              // Parse progress from genStatus like "Analyse IA... (batch 3/12, 1319 courriels)"
              let pct = 5;
              const batchMatch = genStatus.match(/batch\s+(\d+)\s*\/\s*(\d+)/i);
              if (batchMatch) {
                pct = Math.min(95, Math.round((parseInt(batchMatch[1]) / parseInt(batchMatch[2])) * 100));
              } else if (genStatus.toLowerCase().includes('fetch') || genStatus.toLowerCase().includes('récup')) {
                pct = 10;
              } else if (genStatus.toLowerCase().includes('fusion') || genStatus.toLowerCase().includes('merge')) {
                pct = 90;
              }
              return (
                <div className="space-y-4">
                  <div className="w-full bg-stone-100 rounded-full h-2">
                    <div className="bg-brand-500 h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-sm text-brand-600 font-medium">{genStatus}</p>
                  <p className="text-xs text-gray-400">Cela prend 2-3 minutes. Vous pourrez modifier le contexte recueilli après coup.</p>
                </div>
              );
            })()}

            {profileReady && (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-emerald-600 mb-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-semibold">Profil généré</span>
                </div>
                <div className="bg-stone-50 rounded-2xl p-4 text-left max-h-48 overflow-y-auto">
                  <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{generatedContext.slice(0, 500)}...</p>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-3.5 bg-brand-500 text-white rounded-2xl font-semibold hover:bg-brand-600 transition-colors text-sm min-h-[44px]"
                >
                  Continuer
                </button>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
            )}

            {!generating && !profileReady && (
              <button
                onClick={() => { setStep(2); }}
                className="mt-4 text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors"
              >
                Passer cette étape
              </button>
            )}
          </div>
        )}

        {/* Step 2: Ready */}
        {step === 2 && (
          <div className="bg-white rounded-3xl shadow-sm border border-stone-200/80 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">C'est prêt</h2>
            <p className="text-gray-500 leading-relaxed mb-6">
              Votre assistant est configuré. Chaque matin, ouvrez l'app pour voir
              vos urgences et répondre en quelques clics.
            </p>

            <div className="bg-stone-50 rounded-2xl p-5 text-left mb-8 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm">🎤</span>
                <p className="text-xs text-gray-600">Utilisez le <strong>micro</strong> pour dicter du contexte</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm">💬</span>
                <p className="text-xs text-gray-600">Dites <strong>"plus court"</strong> ou <strong>"plus formel"</strong> pour ajuster les réponses</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm">⚙️</span>
                <p className="text-xs text-gray-600">Accédez à votre <strong>contexte</strong> via l'icône engrenage</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
            )}

            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full py-3.5 bg-brand-500 text-white rounded-2xl font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors text-sm min-h-[44px]"
            >
              {saving ? 'Chargement...' : 'Voir mon briefing'}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          {account.email}
        </p>
      </div>
    </div>
  );
}

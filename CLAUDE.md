# CLAUDE.md

## Projet : Agent Courriel — JAXA Production

Assistant email IA pour dirigeants québécois. Se connecte à Gmail via OAuth 2.0, trie les emails par priorité, génère des brouillons de réponse, et permet d'envoyer après validation. Configuration sur mesure sur place.

### Stack

- **Frontend** : React 19, Vite 7, Tailwind CSS v4 (`@tailwindcss/vite` plugin, pas de config séparé)
- **Backend** : Netlify Functions v2 (ESM, `export default async (req) => {}`)
- **Email** : Gmail API (fetch natif) — scope `gmail.readonly` (à étendre pour envoyer/répondre)
- **IA** : Anthropic Claude API (`claude-sonnet-4-20250514`)
- **DB** : Supabase (PostgreSQL)
- **Auth** : Google OAuth 2.0
- **Module system** : ESM (`"type": "module"` dans package.json)

### Structure

```
email-agent/
├── netlify.toml
├── netlify/functions/
│   ├── auth-login.js          # GET — retourne URL OAuth
│   ├── auth-callback.js       # GET — échange code → tokens → Supabase
│   ├── emails-sync.js         # GET — fetch emails via provider
│   ├── config-get.js          # GET — lire user_configs
│   ├── config-update.js       # POST — upsert user_configs
│   ├── emails-analyze.js      # GET — batch analyse IA → résumés + priorités + nettoyage orphelins
│   ├── decisions-list.js      # GET — lister décisions (en attente / résolues)
│   ├── decisions-check.js     # GET — vérifier réponses et résoudre décisions
│   ├── draft-generate.js      # POST — génère brouillon réponse via Claude + crée dans Gmail Drafts
│   ├── draft-send.js          # POST — envoie un brouillon Gmail
│   ├── draft-update.js        # POST — modifie un brouillon (supprime + recrée)
│   ├── calendar-create.js     # POST — crée un événement Google Calendar
│   ├── profile-generate.js    # GET/POST — lance et poll la génération de profil auto
│   ├── profile-generate-background.js # Background function — fetch 2000 emails + analyse + profil
│   ├── providers/
│   │   ├── base.js            # Interface abstraite EmailProvider
│   │   ├── gmail.js           # Gmail API (fetch, getThread, createDraft, sendDraft, deleteDraft)
│   │   └── index.js           # Factory: getProvider('gmail')
│   └── utils/
│       ├── auth.js             # getAccessToken() — refresh transparent + Supabase update
│       ├── claude.js           # Prompt builder + analyse + brouillons + profil auto
│       ├── prioritize.js       # Scoring de priorité (IA + config user)
│       ├── supabase.js        # Client singleton (service role)
│       └── tokens.js          # AES-256-GCM encrypt/decrypt
├── src/
│   ├── App.jsx                # Flow: login → onboarding → briefing/dashboard/config/decisions
│   ├── main.jsx               # Entry point (StrictMode, pas de router)
│   ├── index.css              # @import "tailwindcss"
│   ├── components/
│   │   ├── AuthButton.jsx     # Bouton connexion Gmail
│   │   ├── Briefing.jsx       # Vue principale : briefing matin + brouillons + envoi
│   │   ├── ConfigPanel.jsx    # Édition config post-onboarding (onglets)
│   │   ├── ConfigSteps.jsx    # Composants formulaire partagés + bouton profil auto
│   │   ├── Dashboard.jsx      # Dashboard legacy (stats, vue brute)
│   │   ├── DecisionTracker.jsx # Suivi des décisions en attente / résolues
│   │   └── Onboarding.jsx     # Wizard 4 étapes config initiale
│   ├── hooks/
│   │   ├── useAccount.js      # État auth (localStorage)
│   │   ├── useAnalyses.js     # Fetch analyses IA + état
│   │   ├── useBriefing.js     # Briefing complet : analyse + brouillons + envoi
│   │   ├── useConfig.js       # Charger/sauvegarder user_configs
│   │   ├── useDecisions.js    # Fetch décisions + vérification réponses
│   │   └── useEmails.js       # Fetch emails + loading/error
│   └── lib/
│       └── api.js             # Fetch wrappers → Netlify Functions
└── supabase/migrations/
    ├── 001_initial.sql        # Tables: accounts, user_configs, email_metadata, decisions
    ├── 002_analyze_fields.sql # Ajout priority_score, suggested_action, unique decisions
    └── 003_profile_fields.sql # Ajout profile_status, profile_progress à user_configs
```

### Architecture email multi-provider

Chaque provider implémente `EmailProvider` (base.js) :
- `getAuthUrl(state)` → URL OAuth
- `authenticate(code)` → `{ accessToken, refreshToken, expiresAt, email }`
- `refreshToken(refreshToken)` → `{ accessToken, expiresAt }`
- `revokeAccess(token)`
- `fetchEmails(accessToken, opts)` → format normalisé
- `getThread(accessToken, threadId)` → messages normalisés
- `checkReplyExists(accessToken, emailId)` → boolean

Le format normalisé : `{ id, threadId, from: {name, email, domain}, to, subject, date, snippet, body, threadCount, hasAttachments, labels }`

Pour ajouter Outlook : créer `providers/outlook.js`, l'enregistrer dans `providers/index.js`.

### Pipeline d'analyse IA

```
emails-analyze.js (orchestrateur)
  → fetch emails via provider (Gmail API)
  → filtre ceux déjà analysés dans email_metadata
  → claude.js : batches de 5 emails en parallèle (Promise.all) → Claude Sonnet → JSON structuré
      (summary, category, priority_score, decision_required, deadline, amounts, people, suggested_action)
  → prioritize.js : score IA + bonus config user → priority_level final
      (expéditeur critique +3, mots-clés +1/match, montant ≥ seuil +2, deadline ≤ 3j +2, etc.)
  → upsert email_metadata + création auto dans decisions si decision_required
  → retourne tout trié par priorité
```

Niveaux de priorité : critical (9-10), high (7-8), normal (4-6), low (1-3)

### Navigation frontend

```
App.jsx (state: view)
  ├── login screen (si pas de compte)
  ├── Onboarding wizard (si pas de config)
  ├── Briefing (vue par défaut)
  │   ├── Question du jour (amélioration continue)
  │   ├── 3 sections : Urgences / À traiter / Information
  │   ├── Thread complet (collapsible) + brouillons IA + envoi
  │   ├── Rédaction collaborative (ajuster le brouillon par instruction)
  │   ├── Notes contextuelles sur chaque message
  │   ├── icône engrenage → ConfigPanel
  │   └── icône clipboard → DecisionTracker
  ├── Dashboard (vue legacy, stats)
  ├── ConfigPanel (édition config en 4 onglets + profil auto)
  └── DecisionTracker (en attente / résolues + vérification)
```

### Sécurité — non négociable

- OAuth 2.0 uniquement, jamais de mots de passe email
- Scopes Gmail : `gmail.readonly` + `gmail.send` + `gmail.compose` + `calendar.readonly` + `calendar.events`
- Tokens chiffrés AES-256-GCM dans Supabase (`TOKEN_ENCRYPTION_KEY` = 64 hex chars)
- Format chiffré : `iv:authTag:ciphertext` (tout en hex)
- Zéro rétention du corps des courriels — on stocke résumés et métadonnées seulement
- API Claude commerciale — pas de data training
- **RLS activé** sur les 4 tables Supabase — la clé anon ne peut rien lire/écrire, seul service_role a accès

### Contraintes techniques

- **ESM obligatoire** : tout est `import/export`, pas de `require()`
- **Netlify Functions v2** : `export default async (req) => {}`, retournent `new Response()`
- **Tailwind v4** : pas de `tailwind.config.js`, config via CSS `@import "tailwindcss"` + plugin Vite
- **user_id = email** (simplifié pour Phase 1, pas de table users)
- **Pas de `set -e` équivalent** : les functions doivent gérer leurs erreurs avec try/catch
- **Proxy dev** : `vite.config.js` proxy `/.netlify/functions` vers `localhost:8888` (netlify dev)

### Variables d'environnement

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8888/.netlify/functions/auth-callback
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TOKEN_ENCRYPTION_KEY=    # 64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Conventions

- **Langue** : interface et textes générés en français (québécois standard)
- **Mobile-first** : design responsive, composants Tailwind
- **Coûts API** : utiliser `claude-sonnet-4-20250514` (pas Opus), cacher les résumés
- **Pas de over-engineering** : lean, chaque feature doit prouver sa valeur
- **Onboarding** : wizard 4 étapes (contexte, expéditeurs, mots-clés, seuils) — config modifiable ensuite via ConfigPanel

### Phases de construction

| Phase | Contenu | Statut |
|-------|---------|--------|
| 1 | Setup + abstraction provider + auth Gmail + sync | **Fait** |
| 1.5 | Onboarding wizard (config initiale) | **Fait** |
| 2 | ConfigPanel (modifier config post-onboarding) | **Fait** |
| 3 | Analyse IA (emails-analyze, claude.js, prioritize.js) | **Fait** |
| 4 | Dashboard enrichi (priorités, résumés, compteurs) | **Fait** |
| 5 | Suivi de décisions (scheduled function, tracker) | **Fait** |
| 6 | Provisionnement services + tests internes JAXA | **Fait** |
| 7 | Fix timeout + parallélisation Claude batches | **Fait** |
| 8 | Pivot produit : assistant actif (briefing + brouillons + envoi) pour dirigeants QC | **Décidé** |
| 9 | gmail.send + brouillons IA + briefing + profil auto (2000 emails) | **Fait** |
| 10 | Audit complet + fix bloquants Phase A (OAuth, erreurs, timestamps) | **Fait** |
| 10.5 | Fix logique d'affaire Phase B (persistance, scoring, heuristiques) | **Fait** |
| 11 | PWA + nouvel onboarding + ConfigPanel simplifié + voice input + RLS Supabase | **Fait** |
| 12 | Test end-to-end complet (PWA install, voice, onboarding, envoi, mobile) | À faire |
| 13 | Test interne JAXA + pilote Groupe Tonic | À faire |

## Contexte global
Voir ~/Documents/CONTEXT.md pour le profil complet,
les conventions transversales et la liste des clients actifs.

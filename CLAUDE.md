# CLAUDE.md

## Projet : Agent Courriel — JAXA Production

Agent IA de gestion de courriels. Se connecte à Gmail via OAuth 2.0, analyse avec Claude API, fournit priorités, résumés et suggestions de réponse.

### Stack

- **Frontend** : React 19, Vite 7, Tailwind CSS v4 (`@tailwindcss/vite` plugin, pas de config séparé)
- **Backend** : Netlify Functions v2 (ESM, `export default async (req) => {}`)
- **Email** : Gmail API via `googleapis` — scope `gmail.readonly` uniquement
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
│   ├── emails-analyze.js      # GET — batch analyse IA → résumés + priorités
│   ├── decisions-list.js      # GET — lister décisions (en attente / résolues)
│   ├── decisions-check.js     # GET — vérifier réponses et résoudre décisions
│   ├── providers/
│   │   ├── base.js            # Interface abstraite EmailProvider
│   │   ├── gmail.js           # Implémentation Gmail API
│   │   └── index.js           # Factory: getProvider('gmail')
│   └── utils/
│       ├── claude.js           # Prompt builder + appel Claude API
│       ├── prioritize.js       # Scoring de priorité (IA + config user)
│       ├── supabase.js        # Client singleton (service role)
│       └── tokens.js          # AES-256-GCM encrypt/decrypt
├── src/
│   ├── App.jsx                # Flow: login → onboarding → dashboard/config/decisions
│   ├── main.jsx               # Entry point + BrowserRouter
│   ├── index.css              # @import "tailwindcss"
│   ├── components/
│   │   ├── AuthButton.jsx     # Bouton connexion Gmail
│   │   ├── ConfigPanel.jsx    # Édition config post-onboarding (onglets)
│   │   ├── ConfigSteps.jsx    # Composants formulaire partagés (Onboarding + ConfigPanel)
│   │   ├── Dashboard.jsx      # Dashboard enrichi (compteurs, priorités, résumés IA)
│   │   ├── DecisionTracker.jsx # Suivi des décisions en attente / résolues
│   │   └── Onboarding.jsx     # Wizard 4 étapes config initiale
│   ├── hooks/
│   │   ├── useAccount.js      # État auth (localStorage)
│   │   ├── useAnalyses.js     # Fetch analyses IA + état
│   │   ├── useConfig.js       # Charger/sauvegarder user_configs
│   │   ├── useDecisions.js    # Fetch décisions + vérification réponses
│   │   └── useEmails.js       # Fetch emails + loading/error
│   └── lib/
│       └── api.js             # Fetch wrappers → Netlify Functions
└── supabase/migrations/
    ├── 001_initial.sql        # Tables: accounts, user_configs, email_metadata, decisions
    └── 002_analyze_fields.sql # Ajout priority_score, suggested_action, unique decisions
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
  → claude.js : batch de 10 emails → Claude Sonnet → JSON structuré
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
  ├── Dashboard (vue par défaut)
  │   ├── bouton « Analyser » → appel emails-analyze
  │   ├── icône clipboard → DecisionTracker
  │   └── icône engrenage → ConfigPanel
  ├── ConfigPanel (édition config en 4 onglets)
  └── DecisionTracker (en attente / résolues + vérification)
```

### Sécurité — non négociable

- OAuth 2.0 uniquement, jamais de mots de passe email
- Lecture seule : `gmail.readonly` (Gmail), `Mail.Read` (Outlook futur)
- Tokens chiffrés AES-256-GCM dans Supabase (`TOKEN_ENCRYPTION_KEY` = 64 hex chars)
- Format chiffré : `iv:authTag:ciphertext` (tout en hex)
- Zéro rétention du corps des courriels — on stocke résumés et métadonnées seulement
- API Claude commerciale — pas de data training

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
GOOGLE_REDIRECT_URI=http://localhost:8888/api/auth-callback?provider=gmail
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
| 6 | Polish + tests internes JAXA | À faire |

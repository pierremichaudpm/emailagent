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
│   ├── providers/
│   │   ├── base.js            # Interface abstraite EmailProvider
│   │   ├── gmail.js           # Implémentation Gmail API
│   │   └── index.js           # Factory: getProvider('gmail')
│   └── utils/
│       ├── supabase.js        # Client singleton (service role)
│       └── tokens.js          # AES-256-GCM encrypt/decrypt
├── src/
│   ├── App.jsx                # Flow: login → onboarding → dashboard
│   ├── main.jsx               # Entry point + BrowserRouter
│   ├── index.css              # @import "tailwindcss"
│   ├── components/
│   │   ├── AuthButton.jsx     # Bouton connexion Gmail
│   │   ├── Dashboard.jsx      # Liste emails + header
│   │   └── Onboarding.jsx     # Wizard 4 étapes config initiale
│   ├── hooks/
│   │   ├── useAccount.js      # État auth (localStorage)
│   │   ├── useConfig.js       # Charger/sauvegarder user_configs
│   │   └── useEmails.js       # Fetch emails + loading/error
│   └── lib/
│       └── api.js             # Fetch wrappers → Netlify Functions
└── supabase/migrations/
    └── 001_initial.sql        # Tables: accounts, user_configs, email_metadata, decisions
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
| 2 | ConfigPanel (modifier config post-onboarding) | À faire |
| 3 | Analyse IA (emails-analyze, claude.js, prioritize.js) | À faire |
| 4 | Dashboard enrichi (priorités, résumés, compteurs) | À faire |
| 5 | Suivi de décisions (scheduled function, tracker) | À faire |
| 6 | Polish + tests internes JAXA | À faire |

# WORKING_LOG — Agent Courriel

## 2026-03-07 — Session 1 : Bootstrap complet + Onboarding wizard

### Accompli

**Phase 1 — Setup projet + connexion Gmail (complet)**

1. Initialisation projet : Vite + React 19 + Tailwind CSS v4 + Netlify Functions
2. Couche d'abstraction email multi-provider :
   - `providers/base.js` : classe abstraite avec 7 méthodes (getAuthUrl, authenticate, refreshToken, revokeAccess, fetchEmails, getThread, checkReplyExists)
   - `providers/gmail.js` : implémentation complète Gmail API — parsing headers, décodage body base64url (text/plain prioritaire, fallback html), normalisation des adresses, détection attachments
   - `providers/index.js` : factory singleton
3. Auth OAuth 2.0 :
   - `auth-login.js` : génère l'URL Google OAuth avec state JSON (pour supporter multi-provider)
   - `auth-callback.js` : échange code → tokens, chiffre avec AES-256-GCM, upsert dans Supabase `accounts`, redirect vers `/?account=xxx&provider=gmail`
4. Sync emails :
   - `emails-sync.js` : récupère token chiffré, déchiffre, refresh si expiré (transparent), appelle `provider.fetchEmails()`, retourne format normalisé
5. Utilitaires :
   - `utils/tokens.js` : AES-256-GCM avec IV aléatoire + auth tag — format stocké : `iv:authTag:ciphertext` (hex)
   - `utils/supabase.js` : client singleton avec service role key
6. Schema Supabase : `001_initial.sql` avec 4 tables (accounts, user_configs, email_metadata, decisions) + index
7. Frontend minimal : AuthButton → OAuth redirect, Dashboard avec liste emails (tri par date, badges non lu, attachments, date relative fr-CA), useAccount (localStorage), useEmails (fetch + loading/error)

**Onboarding wizard (complet)**

1. `Onboarding.jsx` : wizard 4 étapes avec stepper visuel
   - Étape 1 : contexte professionnel (textarea)
   - Étape 2 : expéditeurs prioritaires (formulaire dynamique, CRUD inline, niveaux critical/high)
   - Étape 3 : mots-clés déclencheurs (chips toggleables pré-remplies + ajout libre)
   - Étape 4 : seuils (montant $, jours stale)
2. `useConfig.js` : charge config au mount, expose `saveConfig()`
3. `config-get.js` + `config-update.js` : CRUD Netlify Functions avec upsert
4. `App.jsx` modifié : flow conditionnel `account null → login | config loading → spinner | config null → onboarding | config exists → dashboard`

### Décisions techniques

| Décision | Pourquoi |
|----------|----------|
| `type: "module"` dans package.json | Netlify Functions v2+ et Vite exigent ESM |
| Tailwind v4 via `@tailwindcss/vite` plugin | Pas besoin de tailwind.config.js séparé, import direct `@import "tailwindcss"` |
| AES-256-GCM (pas AES-256-CBC) | Authentifié — détecte la corruption/tampering du ciphertext |
| Token encryption key = 64 hex chars | 256 bits en hex = 64 caractères, validé au runtime |
| user_id = email (pas UUID) | Simplifie Phase 1 — pas de table users séparée pour l'instant |
| localStorage pour l'état auth frontend | Suffisant pour MVP, pas de session côté serveur |
| Mots-clés pré-remplis dans le wizard | Basés sur le domaine événementiel/gestion : urgent, deadline, facture, approbation, etc. |
| Pas de react-router utilisé pour l'onboarding | Flow linéaire géré par état local `step`, évite la complexité des routes |

### Problèmes / bloquants

- **Aucun bloquant technique** — le build passe, la structure est en place
- **Non testé end-to-end** : pas de Google Cloud Console configuré, pas de Supabase provisionné, pas de `.env` rempli
- Pour tester, il faut :
  1. Créer un projet Google Cloud Console
  2. Activer Gmail API
  3. Configurer l'OAuth consent screen (type externe ou interne)
  4. Créer des credentials OAuth 2.0 (web app) avec redirect URI `http://localhost:8888/api/auth-callback?provider=gmail`
  5. Créer un projet Supabase et exécuter `001_initial.sql`
  6. Générer un `TOKEN_ENCRYPTION_KEY` : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  7. Remplir `.env` et lancer `netlify dev`

### Prochaines étapes (par priorité)

1. **Provisionner les services** : Google Cloud Console + Supabase + `.env` — sans ça, rien d'autre n'est testable
2. **Phase 3 — Analyse IA** : `emails-analyze.js` (batch emails → Claude API → résumés JSON), `utils/claude.js` (prompt builder), `utils/prioritize.js` (combinaison config user + analyse Claude), stockage dans `email_metadata`
3. **Phase 4 — Dashboard enrichi** : remplacer le dashboard basique par la version avec drapeaux de priorité, résumés IA, compteurs (urgents, décisions, info), tri par priorité au lieu de date
4. **ConfigPanel** : permettre de modifier la config post-onboarding (réutiliser les mêmes composants que l'onboarding mais en mode édition)
5. **Phase 5 — Suivi de décisions** : `decisions-list.js`, `decisions-check.js` (scheduled), `DecisionTracker.jsx`

### Contexte pour reprise

- Le projet est dans `/home/edgar/Documents/Jaxa/Agent email/`
- **Pas de git initialisé** — penser à `git init` + premier commit
- `npm run dev` (Vite seul) fonctionne pour le frontend
- `netlify dev` requis pour tester les functions (proxy les appels `/.netlify/functions/*`)
- Le wizard Onboarding ne sera visible qu'une fois connecté (après OAuth) et si aucune config n'existe dans Supabase
- Le Dashboard actuel est fonctionnel mais basique — il affiche les emails bruts sans analyse IA ni priorité

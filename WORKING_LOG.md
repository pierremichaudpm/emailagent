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
2. ~~**Phase 3 — Analyse IA**~~ → **Fait** (Session 2)
3. **Phase 4 — Dashboard enrichi** : remplacer le dashboard basique par la version avec drapeaux de priorité, résumés IA, compteurs (urgents, décisions, info), tri par priorité au lieu de date
4. **ConfigPanel** : permettre de modifier la config post-onboarding (réutiliser les mêmes composants que l'onboarding mais en mode édition)
5. **Phase 5 — Suivi de décisions** : `decisions-list.js`, `decisions-check.js` (scheduled), `DecisionTracker.jsx`

### Contexte pour reprise

- Le projet est dans `/home/edgar/Documents/Jaxa/Agent email/`
- **Git initialisé** — remote `origin` = `github.com:pierremichaudpm/emailagent.git`
- `npm run dev` (Vite seul) fonctionne pour le frontend
- `netlify dev` requis pour tester les functions (proxy les appels `/.netlify/functions/*`)
- Le wizard Onboarding ne sera visible qu'une fois connecté (après OAuth) et si aucune config n'existe dans Supabase
- Le Dashboard actuel est fonctionnel mais basique — il affiche les emails bruts sans analyse IA ni priorité

---

## 2026-03-09 — Session 2 : Phase 3 — Analyse IA

### Accompli

**Phase 3 — Analyse IA (complet)**

1. `utils/claude.js` — prompt builder + appel Claude API :
   - Construit un prompt système contextuel à partir de la config user (contexte pro, expéditeurs prioritaires, mots-clés, seuils)
   - Envoie un batch d'emails à `claude-sonnet-4-20250514`
   - Parse la réponse JSON (summary, category, priority_score, decision_required, deadline, amounts, people, suggested_action)
   - Body tronqué à 2000 chars pour maîtriser les coûts

2. `utils/prioritize.js` — scoring de priorité hybride :
   - Prend le score IA de Claude comme base
   - Applique des bonus selon la config user : expéditeur critique (+3) ou important (+2), mots-clés trouvés (+1 par match), montants ≥ seuil (+2), décision requise (+1), deadline ≤ 3j (+2) ou dépassée (+3), email stale (+1)
   - Convertit le score final en level : critical (9-10), high (7-8), normal (4-6), low (1-3)
   - Support match par domaine (`@domain.com`) pour les expéditeurs

3. `emails-analyze.js` — Netlify Function orchestratrice :
   - Récupère compte + config en parallèle
   - Fetch les emails via le provider
   - Filtre les emails déjà analysés (évite les appels Claude redondants)
   - Analyse par batch de 10 via Claude
   - Upsert les résultats dans `email_metadata`
   - Crée automatiquement des entrées `decisions` pour les emails nécessitant une décision
   - Retourne analyses triées par priorité (nouvelles + existantes)

4. Migration `002_analyze_fields.sql` :
   - Ajout `priority_score` (integer) et `suggested_action` (text) à `email_metadata`
   - Ajout contrainte unique sur `decisions(user_id, email_id, provider)` pour l'upsert

5. Frontend : ajout `analyzeEmails()` dans `api.js`

6. Git : repo initialisé, remote configuré, initial commit poussé sur GitHub

### Décisions techniques

| Décision | Pourquoi |
|----------|----------|
| Batch de 10 emails max par appel Claude | Balance coût/latence — un appel avec 10 emails est plus efficace que 10 appels individuels |
| Body tronqué à 2000 chars | Contrôle des coûts tokens — le snippet + 2000 chars suffit pour l'analyse |
| Score hybride (IA + règles) | Le score Claude seul ne connaît pas les préférences user — les bonus config personnalisent |
| Filtre emails déjà analysés | Évite de re-consommer l'API Claude pour des emails déjà traités |
| Upsert on conflict | Idempotent — relancer l'analyse ne crée pas de doublons |
| Création auto des decisions | Pas besoin d'une étape manuelle — si Claude dit "décision requise", on track |

### Prochaines étapes

1. ~~**Phase 4 — Dashboard enrichi**~~ → **Fait** (Session 2)
2. **Phase 2 — ConfigPanel** : modifier la config post-onboarding
3. **Provisionner les services** pour test end-to-end

---

## 2026-03-10 — Session 3 : Phase 4 — Dashboard enrichi

### Accompli

**Phase 4 — Dashboard enrichi (complet)**

1. `hooks/useAnalyses.js` — hook pour appeler `emails-analyze` :
   - State : `analyses`, `analyzing`, `error`, `stats` (total, newCount)
   - Expose `analyze()` callback

2. `Dashboard.jsx` réécrit complètement :
   - **Barre de stats** : 4 compteurs (total, critiques, importants, décisions) avec couleurs
   - **Bouton « Analyser »** : lance l'analyse IA, spinner pendant le traitement
   - **Vue analysée** : emails triés par priorité avec badges colorés (critique/important/normal/faible)
   - **Panneau expandable** par email : résumé IA, catégorie, score, action suggérée, deadline, montants, personnes détectées
   - **Icône décision requise** : point violet sur les emails nécessitant une action
   - **Onglets** : "Analysés" (triés par priorité) / "Tous" (vue brute originale)
   - **Fallback** : si aucune analyse, affiche la vue brute + message invitant à analyser
   - Build Vite OK (247 KB gzippé ~78 KB)

### Prochaines étapes

1. ~~**Phase 2 — ConfigPanel**~~ → **Fait** (Session 3)
2. **Provisionner les services** pour test end-to-end
3. **Phase 5 — Suivi de décisions**

---

## 2026-03-10 — Session 3 (suite) : Phase 2 — ConfigPanel

### Accompli

**Phase 2 — ConfigPanel (complet)**

1. `ConfigSteps.jsx` — composants formulaire extraits et partagés :
   - StepContext, StepSenders, StepKeywords, StepThresholds exportés
   - `configToFormState()` : convertit config Supabase → état formulaire local
   - `formStateToConfig()` : convertit état formulaire → config Supabase
   - DEFAULT_KEYWORDS centralisé

2. `Onboarding.jsx` refactoré pour importer depuis ConfigSteps (zéro duplication)

3. `ConfigPanel.jsx` — panneau d'édition config :
   - 4 onglets (Contexte, Expéditeurs, Mots-clés, Seuils)
   - Pré-rempli depuis la config existante via `configToFormState()`
   - Bouton « Enregistrer » avec feedback visuel ("Enregistré" pendant 2s)
   - Bouton « Retour » pour revenir au Dashboard

4. Intégration :
   - `App.jsx` : state `showConfig` pour basculer Dashboard ↔ ConfigPanel
   - `Dashboard.jsx` : bouton engrenage dans le header pour ouvrir la config
   - Build Vite OK (253 KB → ~80 KB gzippé)

### Prochaines étapes

1. **Provisionner les services** pour test end-to-end
2. **Phase 5 — Suivi de décisions**
3. **Phase 6 — Polish + tests**

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

## 2026-03-10 — Session 3 : Phases 4, 2 et 5

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

**Phase 5 — Suivi de décisions (complet)**

1. `decisions-list.js` — Netlify Function :
   - Liste les décisions par utilisateur, filtre par status optionnel
   - Calcule `days_waiting` dynamiquement pour les décisions en attente

2. `decisions-check.js` — Netlify Function :
   - Récupère les décisions en attente
   - Pour chaque décision, appelle `provider.checkReplyExists()` via Gmail API
   - Si réponse trouvée : marque comme `resolved` avec `resolved_at`
   - Sinon : met à jour `days_waiting` et `last_checked`
   - Retourne le nombre vérifié, résolu, et encore en attente

3. `useDecisions.js` — hook frontend :
   - `refresh()` : charger la liste des décisions
   - `check()` : vérifier les réponses + recharger la liste
   - Expose `pending`, `resolved`, `loading`, `checking`

4. `DecisionTracker.jsx` — composant plein écran :
   - Header avec compteurs (en attente / résolues)
   - Bouton « Vérifier » pour lancer la vérification des réponses
   - Section « En attente » avec badges amber, indicateur jours, deadline
   - Section « Résolues » avec badges verts
   - Message vide si aucune décision

5. Intégration :
   - `App.jsx` : navigation par state `view` (dashboard/config/decisions)
   - `Dashboard.jsx` : bouton clipboard dans le header pour accéder au tracker
   - `api.js` : wrappers `listDecisions()` et `checkDecisions()`

### Décisions techniques (Session 3)

| Décision | Pourquoi |
|----------|----------|
| Extraction ConfigSteps.jsx partagé | Évite la duplication entre Onboarding (wizard linéaire) et ConfigPanel (onglets libres) |
| Navigation par state `view` au lieu de react-router | App simple mono-page, pas besoin de deep links pour config/decisions |
| `configToFormState()` / `formStateToConfig()` | Le format Supabase (map sender_priorities, array keyword_flags) ≠ format formulaire (array senders, array avec enabled) — conversion bidirectionnelle propre |
| days_waiting calculé dynamiquement | Plus fiable que de stocker une valeur statique qui se périme — recalculé à chaque requête |
| decisions-check appelle checkReplyExists par email | Vérifie le thread Gmail pour détecter si l'utilisateur a répondu — pas de polling permanent, déclenché manuellement |
| Boutons icônes (engrenage, clipboard) au lieu de texte | Gagne de l'espace dans le header mobile-first sans sacrifier la clarté |

### Problèmes rencontrés

- **Aucun bloquant technique** — toutes les phases ont été complétées sans erreur
- **Migration 002 nécessaire** : la table `email_metadata` n'avait pas de colonne `priority_score` ni `suggested_action`, et `decisions` n'avait pas de contrainte unique pour l'upsert — résolu par `002_analyze_fields.sql`
- **Duplication de code getAccessToken()** : la même logique de refresh token existe dans `emails-sync.js`, `emails-analyze.js` et `decisions-check.js` — à factoriser dans un utilitaire commun lors du polish (Phase 6)
- **Build size** : 258 KB (80 KB gzippé) pour 53 modules — raisonnable pour un MVP, mais à surveiller

### Prochaines étapes

1. **Provisionner les services** pour test end-to-end :
   - Google Cloud Console : projet + Gmail API + OAuth consent screen + credentials
   - Supabase : projet + exécuter `001_initial.sql` puis `002_analyze_fields.sql`
   - Remplir `.env` avec toutes les clés
2. **Phase 6 — Polish + tests** :
   - Factoriser `getAccessToken()` dans un utilitaire partagé
   - Ajouter gestion d'erreurs plus granulaire (token révoqué, quota Gmail, etc.)
   - Tests manuels end-to-end du flow complet
   - Responsive design check sur mobile
   - Optimisation bundle si nécessaire

### Contexte pour reprise

- **Git** : 3 commits sur `origin/main`, tout poussé
- **Toutes les phases fonctionnelles (1–5)** sont complétées — le code compile et le build passe
- **Non testé end-to-end** : aucun service externe provisionné (Google Cloud, Supabase)
- Pour tester : voir la checklist de provisionnement dans la Session 1
- **Fichiers clés modifiés cette session** : Dashboard.jsx (réécrit), App.jsx (navigation 3 vues), Onboarding.jsx (refactoré), api.js (+3 wrappers)
- **Nouveaux fichiers** : ConfigSteps.jsx, ConfigPanel.jsx, DecisionTracker.jsx, useAnalyses.js, useDecisions.js, decisions-list.js, decisions-check.js

---

## 2026-03-11 — Session 4 : Provisionnement services + premier test end-to-end

### Accompli

**Provisionnement Google Cloud Console (complet)**

1. Projet `email-agent-jaxa` créé sur le compte `pierre@studiomicho.com`
2. Gmail API activée
3. OAuth consent screen configuré (app "Agent Courriel JAXA", email `virginiejaffredo@jaxa.ca`)
4. Client OAuth `email-agent-dev` créé avec redirect URI `http://localhost:8888/.netlify/functions/auth-callback`
5. Utilisateur test `virginiejaffredo@jaxa.ca` ajouté dans Audience

**Provisionnement Supabase (complet)**

1. Projet `jaxa email agent` créé (org `pierre@studiomicho.com`)
2. Project ref : `dngtsjfmlbwklnthjjtb`
3. Migration `001_initial.sql` exécutée — 4 tables créées
4. Migration `002_analyze_fields.sql` exécutée — colonnes et contrainte ajoutées

**Configuration locale + .env (complet)**

1. `.env` créé avec toutes les clés (Google, Supabase, Anthropic, TOKEN_ENCRYPTION_KEY)
2. `netlify-cli` installé, `netlify dev` fonctionnel sur `localhost:8888`

**Factorisation getAccessToken (complet)**

- `utils/auth.js` créé — logique centralisée de refresh token
- `emails-sync.js`, `emails-analyze.js`, `decisions-check.js` mis à jour

**Fix authenticate() (complet)**

- `gmail.js` `authenticate()` réécrit avec `fetch()` natif au lieu de `googleapis` `client.getToken()` qui échouait dans Netlify Functions

**Premier test end-to-end réussi**

- OAuth Gmail → callback → tokens chiffrés dans Supabase ✅
- Sync 20 emails → affichage dashboard ✅
- Analyse IA : en cours de test (problème env var ANTHROPIC_API_KEY)

**Nettoyage code**

- `main.jsx` : suppression de `BrowserRouter` (inutilisé)
- `netlify.toml` : ajout `framework = "#custom"`

### Décisions techniques (Session 4)

| Décision | Pourquoi |
|----------|----------|
| `fetch()` natif au lieu de `googleapis.getToken()` | googleapis échoue dans Netlify Functions — fetch natif fiable partout |
| Suppression BrowserRouter | L'app navigue par state `view`, pas par URL |
| `framework = "#custom"` dans netlify.toml | Force le mode custom dev au lieu de l'auto-détection |
| getAccessToken() dans utils/auth.js | 3 functions dupliquaient la même logique de 30 lignes |

### Problèmes rencontrés

| Problème | Cause | Résolution |
|----------|-------|------------|
| `TypeError: fetch failed` sur auth-callback | URL Supabase incorrecte — `i` au lieu de `j` dans le project ref | Corrigé `.env` après diagnostic DNS (`ENOTFOUND`) |
| `TypeError: fetch failed` initial | `googleapis` `client.getToken()` incompatible Netlify Functions | Réécrit avec `fetch()` natif |
| ANTHROPIC_API_KEY requis | Netlify CLI a une variable système qui écrase le `.env` | À résoudre (unset env var Netlify ou renommer) |
| Page blanche | `netlify dev` pas installé / pas lancé | Installation + lancement |
| MIME type errors | Port 5173 occupé par ancien processus | Kill + relance propre |
| Redirect URI avec espace | Copier-coller Google Cloud ajoutait un espace invisible | Retaper manuellement |

### Prochaines étapes

1. **Résoudre ANTHROPIC_API_KEY** pour tester l'analyse IA
2. **Tester le bouton « Analyser »** end-to-end
3. **Phase 7 — Polish UI** : dashboard visuellement basique, à améliorer pour démo client
4. **Déployer sur Netlify** : env vars production, redirect URI production
5. **Tests mobile** responsive

### Contexte pour reprise

- **Services provisionnés** : Google Cloud + Supabase + Anthropic — connectés et fonctionnels
- **OAuth + sync emails** : testé et validé avec `virginiejaffredo@jaxa.ca`
- **Serveur dev** : `cd ~/Documents/Jaxa/Agent\ email && npx netlify dev` (port 8888)
- **Analyse IA** : pas encore testée (ANTHROPIC_API_KEY bloquée par Netlify CLI)
- **UI à polir** : le client trouve le dashboard basique "underwhelming"

---

## 2026-03-11 — Session 5 : Fix timeout, parallélisation + remise en question produit

### Accompli

**Fix timeout analyse IA (complet)**

1. Résolution ANTHROPIC_API_KEY : Netlify CLI injectait une valeur vide qui écrasait le `.env`. Solution : `unset ANTHROPIC_API_KEY` avant `npx netlify dev`
2. Fix `kw.toLowerCase is not a function` dans `prioritize.js` : `keyword_flags` contient des objets `{level, keywords: [...]}`, pas des strings. Réécrit le matching pour itérer dans `group.keywords`
3. Analyse IA testée et fonctionnelle : 3 emails analysés en ~10s ✅
4. `emails-analyze.js` : batches de Claude lancés en **parallèle** via `Promise.all` au lieu de séquentiel. 4 batches × 5 emails = ~10s au lieu de ~40s. Résout le timeout 30s de Netlify Functions
5. `useAnalyses.js` : simplifié — un seul appel API pour les 20 emails, plus de chunking frontend
6. `BATCH_SIZE` réduit de 10 à 5 dans emails-analyze.js

### Décisions techniques (Session 5)

| Décision | Pourquoi |
|----------|----------|
| `Promise.all` pour les batches Claude | 4 batches parallèles ~10s vs 4 séquentiels ~40s — reste dans le timeout 30s |
| BATCH_SIZE = 5 | 5 emails par appel Claude = ~10s. Sûr même en séquentiel, rapide en parallèle |
| Suppression du chunking frontend | Un seul appel backend suffit maintenant — UX simplifiée |
| `fetch()` natif partout | `googleapis` lib inutilisée — tout via fetch direct aux endpoints Google |

### Problèmes rencontrés

| Problème | Cause | Résolution |
|----------|-------|------------|
| ANTHROPIC_API_KEY requis | Netlify CLI injecte une variable vide depuis le compte lié | `unset ANTHROPIC_API_KEY` avant `npx netlify dev` |
| `kw.toLowerCase is not a function` | `keyword_flags` = `[{level, keywords}]`, pas `[string]` | Réécrit le matching dans `prioritize.js` |
| TimeoutError 30s | 20 emails × Claude séquentiel > 30s | Batches parallèles + batch size 5 |

### Remise en question produit — CRITIQUE

Le produit actuel est un **dashboard passif en lecture seule**. Constat :

- L'utilisateur ne peut pas répondre, archiver, labelliser, ni même ouvrir ses emails directement
- Il doit checker deux endroits (l'app + Gmail) — friction pure, zéro valeur nette
- Les 5 phases de build ont peaufiné la fondation "lire" sans jamais aborder "agir"
- Le marché a Superhuman, Spark, Shortwave, SaneBox, et Google Gemini dans Gmail — impossible de les battre en frontal

**Pistes identifiées :**

| Option | Description | Effort | Vendable? |
|--------|-------------|--------|-----------|
| A. App email complète | Lire + répondre + archiver, remplace Gmail | Très gros | Oui si niche |
| B. Extension Chrome / Google Workspace Add-on | L'IA vit DANS Gmail, zéro friction | Moyen (pivot frontend) | Très vendable |
| C. Inbox intelligente hybride | Gère les 5-10 critiques, renvoie vers Gmail pour le reste | Moyen | Correct |
| D. Outil vertical spécialisé | Un seul problème pour un métier précis (avocats, courtiers, comptables) | Variable | Le plus différenciant |

**Conclusion** : le backend (Claude analysis, scoring, decisions) est solide et réutilisable. Le problème est le frontend/UX et le positionnement produit.

### Prochaines étapes — EN ATTENTE DE DÉCISION

1. **Décider la direction produit** : option A, B, C ou D — change tout pour la suite
2. **Identifier le client cible** et son problème spécifique avec les emails
3. Selon la direction choisie :
   - Option A : ajouter `gmail.send` + `gmail.modify`, reconstruire le frontend comme client email
   - Option B : pivoter vers une Chrome extension / Google Workspace Add-on, réutiliser le backend
   - Option C : ajouter liens directs Gmail + brouillons de réponse IA
   - Option D : spécialiser le prompt Claude et l'UX pour un métier précis

### Pivot produit — DÉCISION PRISE (2026-03-13)

**Direction choisie : Assistant email actif pour dirigeants québécois, avec configuration sur mesure sur place.**

Inspiration : article de Florent Daudens — agent IA qui lit les emails via MCP, trie en 3 niveaux (urgent/info/ignoré), rédige des brouillons de réponse. Résultat : 90 min/jour gagnées.

**Positionnement produit :**
- **Cible** : DG / dirigeants de PME québécoises (non-techniques)
- **Valeur** : "Ouvrez l'app le matin, voyez vos 4 urgences, validez les réponses, fermez. 10 min au lieu de 90."
- **Différenciation vs Superhuman/Spark/Shortwave** :
  1. Francophone (français québécois natif, pas traduit)
  2. Configuration sur mesure sur place (JAXA se déplace, comprend le métier du client, configure l'outil)
  3. Support local et proximité (pas un SaaS américain anonyme)
- **Interface** : webapp avec briefing du matin + brouillons de réponse IA + envoi après validation
- **Modèle** : abonnement ~$29/mois + setup fee pour config sur place
- **Coûts API** : ~$8-10/mois/utilisateur (Claude Sonnet, 50 emails/jour)
- **Marge** : ~65%

**Stratégie de validation :**
1. JAXA = cobaye interne (tester le produit sur soi-même)
2. Groupe Tonic = premier client pilote (essai gratuit, configuration sur place)

**Ce qui change techniquement :**
- Ajouter scope `gmail.send` + `gmail.compose` (brouillons + envoi)
- Transformer le dashboard passif en assistant actif (briefing + brouillons + validation + envoi)
- Le backend (analyse, scoring, décisions) reste identique
- L'onboarding wizard existant = la base de la config sur mesure

### Contexte pour reprise

- **Backend fonctionnel** : OAuth ✅, sync ✅, analyse IA ✅ (parallélisée), scoring ✅, décisions ✅
- **Pivot décidé** : assistant email actif pour dirigeants québécois, config sur mesure
- **Prochaine session** : implémenter la v2 — briefing matin + brouillons de réponse + gmail.send

---

## 2026-03-17 — Session 6 : Phase 9 — Assistant actif + profil auto

### Accompli

**Gmail send + brouillons (complet)**

1. `gmail.js` : ajout `createDraft()`, `sendDraft()`, `deleteDraft()`, `_buildRfc2822()` — construit des messages RFC 2822, crée/envoie/supprime des brouillons via Gmail API
2. Scopes OAuth étendus : `gmail.send` + `gmail.compose` (nécessite re-consent)
3. `draft-generate.js` : récupère le thread complet, génère un brouillon via Claude, le crée dans Gmail Drafts
4. `draft-send.js` : envoie un brouillon, marque les décisions comme résolues
5. `draft-update.js` : supprime l'ancien brouillon et recrée avec contenu modifié

**Briefing — vue principale (complet)**

1. `Briefing.jsx` : remplace le Dashboard comme vue par défaut
   - 3 sections : Urgences (critical), À traiter (high), Information (normal+low)
   - Bouton "Générer une réponse" → Claude rédige un brouillon inline
   - Textarea éditable pour modifier le brouillon
   - Boutons Envoyer / Modifier / Fermer
   - Bouton Actualiser + Réanalyser dans le header
2. `useBriefing.js` : hook qui combine analyse + gestion brouillons (generate, update, send, dismiss)
3. `App.jsx` : navigation rewired — briefing par défaut, dashboard secondaire

**Prompt de rédaction enrichi (complet)**

1. `claude.js` `buildDraftSystemPrompt()` : injecte le contexte complet, les expéditeurs prioritaires, l'email de l'utilisateur pour le prénom/signature
2. Adapte tutoiement/vouvoiement, signe avec le bon prénom
3. Met `[À COMPLÉTER]` quand il manque des infos au lieu d'inventer
4. Fallback : si Claude ne retourne pas de JSON, utilise la réponse brute comme corps du brouillon

**Profil auto-généré (complet)**

1. `profile-generate-background.js` : Background Function qui tourne jusqu'à 15 min
   - Fetch 2000 emails metadata (from, to, subject, date, snippet) via Gmail API
   - Analyse en batches de 200 avec Claude Sonnet (extracte contacts, projets, ton, signature)
   - Fusionne les patterns en profil final de 300-500 mots
   - Stocke le résultat dans `user_configs.context` + progression dans `profile_status`/`profile_progress`
2. `profile-generate.js` : endpoint POST (lance le job) + GET (poll status)
3. Frontend : bouton "Générer mon profil automatiquement" dans ConfigSteps avec polling toutes les 3s
4. Migration `003_profile_fields.sql` : colonnes `profile_status` et `profile_progress`

**Nettoyage et robustesse**

1. `emails-analyze.js` : nettoyage des analyses orphelines (emails supprimés de Gmail)
2. `emails-analyze.js` : paramètre `refresh=true` pour forcer la réanalyse complète
3. `draft-generate.js` : vérifie que le dernier message n'est pas de l'utilisateur avant de générer
4. `Briefing.jsx` : erreurs gracieuses — "Vous avez déjà répondu" et "Ce courriel n'est plus disponible" au lieu d'erreurs rouges

### Décisions techniques (Session 6)

| Décision | Pourquoi |
|----------|----------|
| Background Function pour le profil | Le fetch de 2000 emails + analyse Claude dépasse le timeout 30s des functions normales |
| Polling depuis le frontend (3s) | La background function met à jour la progression dans Supabase, le frontend poll |
| Sonnet pour tout (pas Opus) | Opus est trop lent pour le timeout — même en background, Sonnet suffit pour la synthèse |
| Nettoyage orphelins dans emails-analyze | Les emails supprimés de Gmail restaient en DB et crashaient le brouillon |
| Fallback texte brut si JSON invalide | Claude ne retourne pas toujours du JSON valide — on utilise sa réponse brute |

### Problèmes rencontrés

| Problème | Cause | Résolution |
|----------|-------|------------|
| ACCESS_TOKEN_SCOPE_INSUFFICIENT | Token existant n'a que gmail.readonly | Re-consent OAuth nécessaire après changement de scopes |
| Brouillon signé "Michèle" | Claude inventait un prénom | Injecte l'email de l'utilisateur dans le prompt + extraction prénom |
| Timeout profil auto (30s) | 500+ emails metadata + Claude analysis en une seule function | Background Function (15 min max) |
| JSON parse error dans analyzeEmailPatterns | Claude retourne du JSON tronqué sur gros batches | Try/catch avec fallback texte brut |
| "existing is not defined" après forceRefresh | Variable `existing` déclarée dans un bloc else, utilisée après | Remplacé par `existingIds.size > 0` |
| "Requested entity was not found" | Thread supprimé/archivé de Gmail mais analyse en DB | Nettoyage orphelins + message gracieux |
| Brouillon sur email déjà répondu | Le dernier message du thread était de l'utilisateur | Vérification sender avant génération |

### État actuel — problèmes connus

- **Taux d'échec élevé sur "Générer une réponse"** : threads manquants, derniers messages de l'utilisateur. Les erreurs sont maintenant gracieuses mais l'UX reste médiocre.
- **L'outil n'est pas encore montrable à un client** — trop de cas d'erreur, pas assez de polish.
- **Le profil auto fonctionne** mais prend 2-3 minutes pour 2000 emails.

### Prochaines étapes

1. **Polish UX critique** : ne pas afficher les emails dont le thread est inaccessible, cacher le bouton Générer quand c'est inutile
2. **Tester end-to-end** un envoi réel de brouillon (re-consent OAuth nécessaire)
3. **Améliorer la qualité des brouillons** — le profil auto aide mais le prompt peut être affiné
4. **Déployer sur Netlify** pour tester en production (Background Functions ne marchent pas en dev local de la même façon)

### Contexte pour reprise

- **Phase 9 implémentée** : briefing + brouillons + envoi + profil auto
- **Serveur dev** : `cd ~/Documents/Jaxa/Agent\ email && unset ANTHROPIC_API_KEY && npx netlify dev`
- **Re-consent OAuth nécessaire** : les scopes ont changé, l'utilisateur doit se déconnecter/reconnecter
- **Migration SQL exécutée** : `003_profile_fields.sql` (profile_status, profile_progress)
- **Le produit a besoin de polish sérieux** avant d'être montrable

---

## 2026-03-18 — Session 7 : Audit complet + fix systématique

### Accompli

**Audit complet du projet (8 scénarios utilisateur, 12+ fichiers)**

Audit exhaustif couvrant : ouverture app, génération brouillon, modification, envoi, ignorer, navigation, mobile, erreurs. 13 problèmes critiques/hauts identifiés.

**Phase A — Fix bloquants (6 items, tous complétés)**

1. A1: `refreshToken()` réécrit avec fetch natif — l'ancienne version via `googleapis` perdait les scopes OAuth après refresh, causant des 403 sur toutes les opérations d'écriture Gmail
2. A2: Erreurs 403 Gmail affichent maintenant "Reconnectez-vous" au lieu d'un message technique
3. A3: `draft-send.js` ne marque plus TOUTES les décisions résolues — filtre par `email_id`
4. A4: Emails dismissed filtrés correctement même quand il n'y a pas de nouvelles analyses
5. A5: Doublon du champ `labels` supprimé dans `normalizeMessage()`
6. A6: Timestamps convertis en ISO 8601 pour Supabase (déjà fait session 6)

**Phase B — Logique d'affaire (5 items, tous complétés)**

1. B1: `user_replied` et `is_automatic` maintenant persistés dans `email_metadata` via upsert après les checks
2. B2: `draft_id` persisté dans `email_metadata` quand un brouillon est créé — brouillons restaurés au rechargement avec status 'saved'
3. B3: Heuristique `is_automatic` affinée — retirés les domaines ambigus (linkedin.com, google.com), gardé seulement les patterns clairement automatiques (noreply@, payments.interac.ca, etc.), labels Gmail réduits à CATEGORY_PROMOTIONS uniquement
4. B4: Soft delete pour les orphelins — `dismissed=true` au lieu de `DELETE` pour préserver l'historique
5. B5: Scoring capé à +4 max au-dessus du score IA pour éviter les faux positifs critiques

**Phase C — UX (partiel)**

1. C1/C3: Status 'saved' pour les brouillons persistés, affiche "Brouillon sauvegardé dans Gmail" + bouton "Regénérer"
2. C4: Fix `useAnalyses` — `refresh` alias ajouté (Dashboard appelait `refresh` mais le hook retournait `analyze`)
3. Bouton "Ignorer" (permanent, persiste en DB via `email-dismiss.js`)

**Phase D — Nettoyage**

1. D4: `react-router-dom` supprimé du projet (jamais utilisé, ~50KB bundle waste)

**Migrations SQL créées**

- `004_dismissed_field.sql` : `dismissed boolean DEFAULT false` sur `email_metadata`
- `005_briefing_fields.sql` : `user_replied boolean`, `is_automatic boolean`, `draft_id text` sur `email_metadata`

### Décisions techniques (Session 7)

| Décision | Pourquoi |
|----------|----------|
| fetch natif pour refreshToken() | googleapis perdait les scopes après refresh → 403 sur toutes les opérations d'écriture |
| Soft delete (dismissed=true) au lieu de hard delete | Préserve l'historique, évite de recréer des analyses pour des emails déjà traités |
| Heuristique is_automatic réduite | linkedin.com et google.com filtraient des emails humains légitimes |
| Scoring capé à +4 | Empêche un email normal (score IA=5) de devenir critique (10) par accumulation de bonus |
| draft_id persisté en email_metadata | Permet de restaurer les brouillons entre sessions sans re-appeler Claude |
| Pas de react-router-dom | L'app navigue par state local, la dépendance était inutile |

### Problèmes identifiés — CRITIQUES (pas encore résolus)

**3 problèmes qui rendent l'outil inutilisable pour un DG :**

| # | Problème | Impact | Solution identifiée |
|---|----------|--------|---------------------|
| P1 | **Brouillons perdus au refresh/navigation** — body, subject, to pas en DB, seulement draft_id | DG perd 10 min de rédaction | Ajouter colonnes draft_body, draft_subject, draft_to en email_metadata + persister à la génération |
| P2 | **Emails ignorés reviennent après refresh** — dismissed est en DB mais le state frontend n'est pas restauré | DG doit re-ignorer les mêmes emails | Initialiser dismissed Set depuis les analyses retournées par le backend |
| P3 | **Email reste dans briefing après envoi** — draft-send ne marque pas email_metadata comme traité | DG ne sait pas si c'est envoyé ou pas | Ajouter user_sent_reply en email_metadata, mettre à jour après sendDraft |

**13 problèmes hauts identifiés au total** — voir audit complet dans la session.

### Prochaines étapes — PLAN DE STABILISATION

**Phase 1 (Blockers absolus) — prochaine session :**
1. Persistent draft storage : colonnes draft_body/subject/to + persister à la génération + restaurer au refresh
2. Mark user_sent_reply après envoi dans email_metadata
3. Restaurer dismissed Set depuis les analyses au refresh
4. Meilleurs messages d'erreur (scope insufficient → "Reconnectez-vous")

**Phase 2 (High priority) :**
5. Filtrer user_replied dans le briefing (pas juste le calculer)
6. Supprimer brouillons Gmail quand on ignore un email
7. State global (React Context) pour préserver l'état entre navigations
8. localStorage backup pour les modifications en cours

**Phase 3 (Medium) :**
9. Confirmation modale avant envoi
10. Améliorations mobile (textarea auto-expand, boutons plus gros)
11. Timeout/retry logic pour Claude API
12. Re-consent OAuth + test envoi réel end-to-end

### Contexte pour reprise

- **Phases A+B terminées** : tous les fix bloquants et logique d'affaire appliqués
- **Migrations SQL à exécuter** : `004_dismissed_field.sql` et `005_briefing_fields.sql`
- **Re-consent OAuth toujours nécessaire** : scopes gmail.send/compose ajoutés mais pas encore re-autorisés
- **Le produit est NON FONCTIONNEL pour un vrai utilisateur** — les brouillons se perdent, les emails ignorés reviennent, l'envoi ne marque pas l'email comme traité
- **Plan de stabilisation en 3 phases** défini et priorisé — Phase 1 = blockers absolus

---

## 2026-03-18 — Session 8 : Assistant actif, redesign, audit fixes

### Accompli

**Redesign complet de l'interface**

1. Briefing : fond beige vintage (`bg-[#f5f0e8]`), typographie serif pour les titres, cards avec ombres douces, bordures colorées par priorité (rouge/ambre/gris)
2. Login page : redesigné avec même palette beige
3. ConfigPanel, Onboarding, DecisionTracker : harmonisés avec le design beige vintage
4. Touch targets 44px minimum sur tous les boutons du Briefing (mobile-first)

**Features ajoutées**

1. **Thread complet** : chaque email montre le fil de discussion avec messages collapsibles, dernier message ouvert par défaut
2. **Rédaction collaborative** : champ "Dites à l'IA quoi ajuster..." sous chaque brouillon + bouton "Ajuster" qui regénère avec instructions
3. **Question du jour** : bloc en haut du briefing, une question d'amélioration continue par jour (expéditeur à prioriser, projet important, etc.)
4. **Notes contextuelles** : "+ Ajouter une note" sur chaque email card + bouton note dans chaque message du thread
5. **Ajout de contexte libre** : champ sous la question du jour pour ajouter du contexte temporaire
6. **Légende** : explication du point violet (décision requise) et du check vert (envoyé)
7. **Bouton "Ignorer"** permanent avec persistance en DB
8. **Signature dans les brouillons** : Claude utilise la signature du profil auto-généré
9. **Double-click prevention** sur "Envoyer" : state `sending` désactive le bouton après premier clic

**Déploiement production**

1. Variables d'environnement configurées dans Netlify
2. Redirect URI production ajouté dans Google Cloud Console
3. App déployée sur `https://jaxamail.netlify.app`
4. OAuth fonctionnel en production ✅

**Migrations SQL exécutées**

- `003_profile_fields.sql` ✅
- `004_dismissed_field.sql` ✅
- `005_briefing_fields.sql` ✅

### Décisions techniques (Session 8)

| Décision | Pourquoi |
|----------|----------|
| Beige vintage (#f5f0e8) au lieu de gris | Chaleureux et premium, pas corporate froid — colle avec "assistant personnel" |
| Thread collapsible avec dernier message ouvert | Le DG a besoin de lire le dernier message pour contextualiser sa réponse |
| Question du jour au lieu de feedback par email | Moins intrusif, une seule interaction d'amélioration par session |
| Rédaction collaborative par instruction | Le DG ne réécrit pas — il dit "plus court" ou "mentionne le budget" et l'IA ajuste |
| Touch targets 44px | Standard Apple pour le tactile — le DG utilise son téléphone le matin |
| Produit complémentaire, pas SaaS standalone | JAXA l'offre dans ses projets, pas en abonnement $29/mois |

### Problèmes rencontrés

| Problème | Cause | Résolution |
|----------|-------|------------|
| Erreur 400 Google en prod | Redirect URI de prod manquant dans Google Cloud Console | Ajouté `https://jaxamail.netlify.app/.netlify/functions/auth-callback` |
| `.env` invisible dans le file manager | Fichier caché (commence par `.`) | Copié le contenu directement pour import Netlify |
| Emails déjà répondus classés urgents | Le check `user_replied` ne filtrait pas dans le briefing | Filtré côté backend et frontend |
| Brouillon signé "Michèle" | Prénom manquant dans le prompt Claude | Extraction depuis l'email utilisateur + profil |

### Contexte pour reprise

- **App en production** : `https://jaxamail.netlify.app` — OAuth + briefing fonctionnels
- **Serveur dev** : `cd ~/Documents/Jaxa/Agent\ email && unset ANTHROPIC_API_KEY && npx netlify dev`
- **Toutes les migrations SQL exécutées** (001-005)
- **Le produit est fonctionnel** : briefing, analyse, brouillons, envoi, profil auto, thread complet
- **Reste à tester** : rédaction collaborative, question du jour, notes contextuelles (codés mais pas testés en vrai)
- **Reste à faire** : test mobile complet, test end-to-end envoi depuis prod

---

## 2026-03-25 — Session 9 : PWA, onboarding, sécurité, voice input

### Accompli

**PWA (Progressive Web App)**

1. `manifest.json` avec icônes 192x192 et 512x512 (enveloppe + sparkle IA, palette brun/beige)
2. Service worker pour installation sur Android/iOS
3. App installable comme application native sur téléphone

**Nouvel onboarding simplifié**

1. Écran 1 : "Votre assistant email" — explication visuelle du fonctionnement (3 features clés)
2. Écran 2 : "On apprend à vous connaître" — scan de 2000 emails + barre de progression réelle
3. Écran 3 : "C'est prêt" → premier briefing
4. Plus de formulaire technique (expéditeurs, mots-clés, seuils) — l'IA déduit tout du contexte

**ConfigPanel simplifié**

1. Suppression des onglets Expéditeurs, Mots-clés, Seuils — devenus caducs avec le profil auto-généré
2. L'engrenage ouvre directement le contexte (profil + textarea éditable + bouton profil auto)

**Voice input (Web Speech Recognition)**

1. Bouton micro sur "+ Contexte" en haut du briefing (notes de la semaine)
2. Bouton micro sur "+ Contexte" dans chaque email card (notes spécifiques)
3. Mode `continuous: true` pour dictée longue sans coupure
4. Natif au navigateur, zéro dépendance externe, zéro coût

**Question du jour améliorée**

1. Biais inversé : au lieu de "est-ce que X devrait être prioritaire?" (tout le monde dit oui), on demande "est-ce que X est classé trop haut?" (l'utilisateur réfléchit à déclasser)
2. Questions réservées aux cas vraiment ambigus (nouvel expéditeur + montant élevé)
3. L'agent prend la décision par défaut, l'utilisateur corrige si nécessaire

**Bouton "+ Contexte" comme CTA**

1. Bouton visible et proéminent en haut du briefing
2. Présent aussi dans chaque email card
3. Avec micro pour dicter au lieu de taper

**Sécurité — RLS Supabase**

1. Row Level Security activé sur les 4 tables (accounts, user_configs, email_metadata, decisions)
2. Clé anon ne peut plus rien lire/écrire
3. Seul service_role (utilisé par les Netlify Functions) a accès complet

**Déploiement**

1. Plan Netlify Personal ($9/mois) activé — background functions supportées
2. Dernier push sur GitHub → auto-deploy sur `https://jaxamail.netlify.app`
3. Migration `user_configs INSERT` pour créer les configs manquantes

### Décisions techniques (Session 9)

| Décision | Pourquoi |
|----------|----------|
| PWA au lieu d'app native | Zéro coût App Store, installation directe depuis le navigateur, même codebase |
| Onboarding sans formulaire | Le DG ne configure rien — l'IA scanne ses emails et comprend son contexte |
| ConfigPanel = contexte seulement | Les onglets techniques (expéditeurs, mots-clés, seuils) sont redondants avec le profil auto |
| Voice input natif (Web Speech API) | Zéro dépendance, zéro coût — le DG dicte au lieu de taper sur mobile |
| RLS sur Supabase | Vulnérabilité critique détectée par Supabase Security Advisor |
| Biais inversé sur la question du jour | Évite que tout le monde devienne "prioritaire" en 2 semaines |

### Problèmes rencontrés

| Problème | Cause | Résolution |
|----------|-------|------------|
| Profil auto bloque en prod | Background functions non supportées sur plan Free | Upgrade au plan Personal ($9/mois) |
| Barre progression à 50% dès le début | Animation CSS placeholder `animate-pulse` à `width: 60%` | Connectée au vrai polling avec progression réelle |
| Config non créée après onboarding | Bouton "Voir mon briefing" ne créait pas la config | INSERT manuel dans Supabase + fix du flow |
| Vulnérabilités sécurité Supabase | RLS désactivé sur les 4 tables | Activé RLS + politiques service_role |

### Contexte pour reprise

- **App en production** : `https://jaxamail.netlify.app` — PWA installable
- **RLS activé** sur toutes les tables Supabase
- **Plan Netlify Personal** ($9/mois) — background functions fonctionnelles
- **Onboarding simplifié** : scan 2000 emails → profil auto → briefing
- **Voice input** opérationnel sur mobile (Web Speech API)
- **Reste à tester** : PWA install sur Android/iOS, voice input en conditions réelles, onboarding complet de bout en bout
- **Prochaines étapes** : test interne JAXA complet, puis pilote Groupe Tonic

---

## 2026-03-25 — Session 10 : Intégration Google Calendar (4 phases)

### Accompli

**Phase A — Lecture calendrier (complet)**

1. `services/google-calendar.js` — wrapper Calendar API (fetch natif) : `listEvents()`, `getFreeBusy()`, `normalizeEvent()`
2. `calendar-events.js` — Netlify Function GET : événements sur 7 jours, timezone America/Montreal
3. `CalendarWidget.jsx` — timeline compacte dans le briefing (beige vintage, mobile-first, collapsible par jour)
4. `useCalendar.js` — hook React avec groupement par jour et refresh
5. Scope `calendar.readonly` ajouté dans `gmail.js`

**Phase B — Contexte IA enrichi (complet)**

1. `buildCalendarContext(events)` dans `claude.js` — formate l'agenda en texte lisible pour Claude (jours français, heures 24h, événements all-day)
2. `emails-analyze.js` — fetch événements en parallèle avec les emails, passe le contexte calendrier à Claude pour chaque batch d'analyse
3. `draft-generate.js` — fetch événements, passe le contexte à `generateDraftReply()` pour que Claude propose des créneaux libres concrets
4. `calendar-freebusy.js` — Netlify Function GET : créneaux libres par jour ouvrable (9h-17h)
5. Prompts Claude enrichis : règles pour proposer des créneaux, ne pas proposer les heures occupées, format clair

**Phase C — Actions calendrier (complet)**

1. `createEvent()` ajouté dans `google-calendar.js`
2. `calendar-create.js` — Netlify Function POST : créer un événement
3. Scope `calendar.events` ajouté
4. Prompt brouillon mis à jour : Claude retourne `suggested_event` quand un rendez-vous est proposé
5. Bouton "Bloquer le créneau" dans le UI après envoi d'un brouillon avec rendez-vous
6. `createCalendarEvent()` dans `api.js` et `useBriefing.js`

**Phase D — Intelligence avancée (complet)**

1. `generateDailyQuestion()` enrichi avec calendrier : cross-référence des participants de meetings avec les expéditeurs d'emails
2. `daily-question.js` — nouvelle Netlify Function qui fetch calendrier + analyses pour générer la question du jour
3. Prompt d'analyse enrichi : Claude vérifie si les dates mentionnées dans les emails correspondent à des événements existants
4. Détection de dates dans les notes contextuelles (regex français : jours, "demain", "le 25", etc.) → suggestion "Créer un rappel ?"
5. CalendarWidget : bouton "+" pour création rapide d'événement (formulaire inline)

### Décisions techniques (Session 10)

| Décision | Pourquoi |
|----------|----------|
| Calendrier = service, pas provider | L'interface est différente d'un EmailProvider — pas de fetchEmails, getThread, etc. |
| Fetch calendrier en parallèle avec les emails | Pas de latence ajoutée au pipeline d'analyse (~200ms pour Calendar API) |
| Calendar context optionnel partout | Si le fetch échoue, l'analyse et les brouillons fonctionnent quand même |
| Timezone hardcodé America/Montreal | Tous les clients sont québécois — à rendre configurable si expansion |
| suggested_event dans le JSON Claude | Permet au frontend d'offrir "Bloquer le créneau" sans parsing du texte |
| Date detection par regex français | Simple et efficace pour les patterns courants (lundi, demain, le 25) |

### Audit de code

Audit complet des 4 phases :
- ✅ ESM partout, pas de `require()`
- ✅ Signatures de fonctions cohérentes, paramètres optionnels rétrocompatibles
- ✅ Patterns Netlify Functions v2 respectés
- ✅ Props CalendarWidget correctement passés depuis Briefing.jsx
- ✅ Erreurs gérées gracieusement partout (calendrier qui échoue ne casse rien)
- ✅ Build passe

### Contexte pour reprise

- **Calendrier intégré** : lecture + contexte IA + création d'événements + intelligence avancée
- **Re-consent OAuth nécessaire** : scopes `calendar.readonly` + `calendar.events` ajoutés
- **4 nouvelles Netlify Functions** : calendar-events, calendar-create, calendar-freebusy, daily-question
- **Prochaine étape** : tester le flow complet (re-consent → calendrier dans briefing → brouillon avec créneaux → création événement)

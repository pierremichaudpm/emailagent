import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-20250514';

let client;
function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY requis');
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Construit le prompt système à partir de la config utilisateur.
 */
function buildSystemPrompt(config) {
  const parts = [
    `Tu es un assistant de triage de courriels professionnels. Tu analyses des courriels et retournes une analyse JSON structurée.`,
    `Réponds UNIQUEMENT en JSON valide, sans markdown ni texte autour.`,
  ];

  if (config.context) {
    parts.push(`Contexte professionnel de l'utilisateur : ${config.context}`);
  }

  if (config.sender_priorities && Object.keys(config.sender_priorities).length > 0) {
    const senders = Object.entries(config.sender_priorities)
      .map(([email, level]) => `${email} → ${level}`)
      .join(', ');
    parts.push(`Expéditeurs prioritaires : ${senders}`);
  }

  if (config.keyword_flags && config.keyword_flags.length > 0) {
    parts.push(`Mots-clés déclencheurs (augmentent la priorité) : ${config.keyword_flags.join(', ')}`);
  }

  if (config.amount_threshold) {
    parts.push(`Seuil montant important : ${config.amount_threshold} $`);
  }

  if (config.stale_days) {
    parts.push(`Un courriel sans réponse depuis ${config.stale_days} jours est considéré en retard.`);
  }

  return parts.join('\n\n');
}

/**
 * Construit le message utilisateur pour un batch d'emails.
 */
function buildUserMessage(emails) {
  const emailBlocks = emails.map((e, i) => {
    const parts = [
      `--- COURRIEL ${i + 1} ---`,
      `ID: ${e.id}`,
      `De: ${e.from.name} <${e.from.email}>`,
      `Objet: ${e.subject}`,
      `Date: ${e.date}`,
    ];
    if (e.snippet) parts.push(`Extrait: ${e.snippet}`);
    if (e.body) parts.push(`Corps:\n${e.body.slice(0, 2000)}`);
    return parts.join('\n');
  });

  return `Analyse les courriels suivants. Pour CHAQUE courriel, retourne un objet JSON dans un tableau avec ces champs :
- "email_id" (string) : l'ID du courriel
- "summary" (string, max 2 phrases) : résumé concis en français
- "category" (string) : une de [action_requise, information, suivi, finance, rh, marketing, spam]
- "priority_score" (number 1-10) : 10 = plus urgent
- "decision_required" (boolean) : true si une décision ou réponse est attendue
- "deadline" (string ISO 8601 ou null) : deadline détectée dans le contenu
- "amounts" (array of numbers) : montants monétaires détectés
- "people" (array of strings) : personnes mentionnées (noms)
- "suggested_action" (string, max 1 phrase) : action suggérée

Retourne un tableau JSON : [{ ... }, { ... }]

${emailBlocks.join('\n\n')}`;
}

/**
 * Envoie un batch d'emails à Claude pour analyse.
 * Retourne le tableau d'analyses parsé.
 */
export async function analyzeEmails(emails, config) {
  if (!emails.length) return [];

  const anthropic = getClient();
  const systemPrompt = buildSystemPrompt(config);
  const userMessage = buildUserMessage(emails);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;

  // Extraire le JSON même si Claude ajoute du texte autour
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Réponse Claude invalide : JSON non trouvé');
  }

  return JSON.parse(jsonMatch[0]);
}

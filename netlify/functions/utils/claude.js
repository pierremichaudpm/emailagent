import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-20250514';
const MODEL_OPUS = 'claude-opus-4-20250514';

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
 * Construit le prompt pour la génération de brouillon de réponse.
 */
function buildDraftSystemPrompt(config, userEmail, calendarContext) {
  const context = config.context || 'un professionnel';
  const userName = userEmail ? userEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

  const parts = [
    `Tu es l'assistant email de ${context}.`,
    `L'adresse email de l'utilisateur est : ${userEmail || 'inconnue'}.`,
    userName ? `Le nom probable de l'utilisateur est : ${userName}. Utilise ce prénom pour signer, sauf si le contexte professionnel indique un autre prénom.` : '',
    `Rédige une réponse professionnelle à ce courriel, en te mettant dans la peau de cette personne.`,
    '',
    'PROFIL ET TON :',
  ].filter(Boolean);

  // Injecter le contexte enrichi s'il existe
  if (config.context && config.context.length > 50) {
    parts.push(`Contexte professionnel complet : ${config.context}`);
  }

  // Injecter les relations avec les expéditeurs
  if (config.sender_priorities && Object.keys(config.sender_priorities).length > 0) {
    const senders = Object.entries(config.sender_priorities)
      .map(([email, level]) => `${email} (${level})`)
      .join(', ');
    parts.push(`Relations connues / expéditeurs importants : ${senders}`);
  }

  parts.push(
    '',
    'RÈGLES DE RÉDACTION :',
    '- Français québécois standard (pas de France, pas de slang)',
    '- Concis : 3-5 phrases max sauf si le sujet exige plus',
    '- Ton : professionnel mais humain, pas corporatif',
    '- Va droit au but, pas de "J\'espère que vous allez bien"',
    '- TOUJOURS terminer le message avec la signature professionnelle de l\'utilisateur telle que décrite dans le contexte (prénom, titre, entreprise, téléphone). Si le contexte mentionne une signature, utilise-la exactement.',
    '- Adapte le tutoiement/vouvoiement selon la relation avec l\'expéditeur',
    '- Si l\'email demande une décision, propose une position claire',
    '- Si c\'est une demande d\'info, fournis une réponse structurée',
    '- NE JAMAIS inventer de faits, dates, chiffres ou engagements',
    '- Si tu manques d\'info pour répondre, indique [À COMPLÉTER] dans le brouillon',
  );

  if (calendarContext) {
    parts.push(
      '',
      'CALENDRIER :',
      '- Tu as accès au calendrier de l\'utilisateur pour la semaine à venir.',
      '- Si l\'email demande un rendez-vous ou une disponibilité, propose des créneaux libres concrets basés sur le calendrier.',
      '- Si un créneau est déjà pris, ne le propose pas.',
      '- Formate les propositions : "Je serais disponible mardi 26 mars à 14h ou mercredi 27 à 10h."',
      '- Si l\'email ne concerne pas un rendez-vous, n\'insère pas d\'information calendrier dans la réponse.',
    );
  }

  parts.push(
    '',
    'ÉVÉNEMENT CALENDRIER :',
    '- Si ta réponse propose ou confirme un rendez-vous, une rencontre ou un appel avec une date/heure précise, ajoute un champ "suggested_event" au JSON.',
    '- Si la réponse ne concerne pas un rendez-vous, mets "suggested_event": null.',
    '',
    'Réponds UNIQUEMENT en JSON valide : { "subject": "Re: ...", "body": "...", "tone": "formel|cordial|direct", "suggested_event": { "summary": "Titre du rendez-vous", "start": "2026-03-26T14:00:00", "end": "2026-03-26T15:00:00", "attendees": ["email@example.com"] } | null }'
  );

  return parts.join('\n');
}

function buildDraftUserMessage(thread, analysis) {
  const parts = [];

  if (analysis) {
    parts.push(`ANALYSE EXISTANTE :`);
    parts.push(`Résumé : ${analysis.summary || 'N/A'}`);
    parts.push(`Action suggérée : ${analysis.suggested_action || 'N/A'}`);
    parts.push(`Priorité : ${analysis.priority_level || 'N/A'}`);
    parts.push('');
  }

  parts.push('FIL DE DISCUSSION (du plus ancien au plus récent) :');
  for (const msg of thread) {
    parts.push(`--- De: ${msg.from.name} <${msg.from.email}> ---`);
    parts.push(`Objet: ${msg.subject}`);
    parts.push(`Date: ${msg.date}`);
    parts.push(msg.body ? msg.body.slice(0, 3000) : msg.snippet || '');
    parts.push('');
  }

  parts.push('Rédige une réponse au dernier message du fil.');
  return parts.join('\n');
}

/**
 * Génère un brouillon de réponse via Claude.
 * Retourne { subject, body, tone }.
 * @param {Array} thread
 * @param {Object} analysis
 * @param {Object} config
 * @param {string} userEmail
 * @param {string} [calendarContext] — bloc texte agenda (optionnel)
 */
export async function generateDraftReply(thread, analysis, config, userEmail, calendarContext) {
  const anthropic = getClient();
  const systemPrompt = buildDraftSystemPrompt(config, userEmail, calendarContext);
  let userMessage = buildDraftUserMessage(thread, analysis);
  if (calendarContext) {
    userMessage += '\n\n' + calendarContext;
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }
  // Fallback : Claude a répondu en texte libre, on en fait un brouillon
  const lastMsg = thread[thread.length - 1];
  return {
    subject: `Re: ${lastMsg?.subject || ''}`,
    body: text,
    tone: 'cordial',
  };
}

/**
 * Raffine un brouillon existant selon une instruction de l'utilisateur.
 * Retourne { subject, body, tone }.
 */
export async function refineDraftReply(currentDraft, instruction, thread, config, userEmail) {
  const anthropic = getClient();
  const systemPrompt = buildDraftSystemPrompt(config, userEmail);

  const userMessage = [
    'BROUILLON ACTUEL :',
    currentDraft.body,
    '',
    'FIL DE DISCUSSION ORIGINAL :',
    ...(thread || []).map((msg) => `--- De: ${msg.from?.name || msg.from?.email} ---\n${(msg.body || msg.snippet || '').slice(0, 2000)}`),
    '',
    `INSTRUCTION DE L'UTILISATEUR : ${instruction}`,
    '',
    'Réécris le brouillon en tenant compte de l\'instruction. Garde le même format et la même signature.',
    'Réponds UNIQUEMENT en JSON valide : { "subject": "Re: ...", "body": "...", "tone": "formel|cordial|direct" }',
  ].join('\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return { subject: currentDraft.subject, body: text, tone: currentDraft.tone || 'cordial' };
}

/**
 * Génère une question d'amélioration quotidienne basée sur les analyses du jour.
 * Retourne { question, type, options, context }.
 */
export async function generateDailyQuestion(analyses, config, calendarContext, events) {
  const anthropic = getClient();

  const emailSummary = analyses.slice(0, 15).map((a) => (
    `- De: ${a.sender_name || a.sender_email} (${a.sender_email}) | Priorité: ${a.priority_level} | Score: ${a.priority_score} | Sujet: ${a.subject}`
  )).join('\n');

  const currentSenders = config.sender_priorities
    ? Object.keys(config.sender_priorities).join(', ')
    : 'aucun';

  // Build calendar insight block
  let calendarBlock = '';
  if (calendarContext) {
    calendarBlock = '\n\nAGENDA DE LA SEMAINE :\n' + calendarContext;
  }

  // Extract attendees from events for cross-referencing with email senders
  let meetingContacts = '';
  if (events && events.length > 0) {
    const attendeeEmails = new Set();
    for (const evt of events) {
      if (evt.attendees) {
        for (const a of evt.attendees) {
          if (a.email) attendeeEmails.add(a.email.toLowerCase());
        }
      }
    }
    if (attendeeEmails.size > 0) {
      meetingContacts = '\nCONTACTS AVEC MEETINGS PRÉVUS : ' + [...attendeeEmails].join(', ');
    }
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: `Tu es un assistant qui aide à calibrer un outil de tri email. Tu poses UNE seule question courte, répondable en un clic ou une phrase courte.

RÈGLES CRITIQUES :
- Ne demande JAMAIS "est-ce que X devrait être prioritaire?" — ce biais pousse tout le monde vers le haut et en 2 semaines tout est urgent.
- Préfère les questions de DÉCLASSEMENT : "X est classé Important, est-ce trop haut?" — ça pousse l'utilisateur à réfléchir à ce qu'il peut déclasser.
- Pose des questions SEULEMENT pour les cas vraiment ambigus : un nouvel expéditeur inconnu avec un montant élevé, un pattern incohérent, un domaine jamais vu.
- Si le profil et le scoring gèrent déjà bien les emails du jour, retourne null — pas besoin de question.
- Les contacts récurrents que le profil connaît déjà ne justifient PAS une question.

QUESTIONS CALENDRIER (type: calendar_insight) :
- Si un contact a un meeting prévu mais aucun échange email récent, propose de préparer un message.
- Si 3+ réunions sont consécutives (moins de 30 min entre chaque), propose de bloquer du temps tampon.
- Si un contact fréquent dans les emails n'a aucun événement prévu cette semaine, signale-le.
- Les questions calendrier ont le type "calendar_insight" et des options comme ["Oui, envoyer", "Non merci", "Rappeler plus tard"].`,
    messages: [{
      role: 'user',
      content: [
        'Voici les emails du jour, la config actuelle et l\'agenda de la semaine.',
        '',
        'EMAILS DU JOUR :',
        emailSummary,
        '',
        `EXPÉDITEURS PRIORITAIRES ACTUELS : ${currentSenders}`,
        `CONTEXTE UTILISATEUR : ${(config.context || '').slice(0, 500)}`,
        calendarBlock,
        meetingContacts,
        '',
        'Génère UNE question pour calibrer le tri OU une observation calendrier/email, OU retourne null si rien n\'est pertinent.',
        '',
        'Exemples de bonnes questions :',
        '- "[Nom] vous a écrit 3 fois ce mois-ci. Classé Important. Est-ce trop haut?" (type: sender_priority)',
        '- "Nouvel expéditeur [Nom] de [entreprise] mentionne 45K$. Comment le classer?" (type: sender_priority)',
        '- "Quel projet est le plus critique cette semaine?" (type: context)',
        '- "Vous avez un meeting avec [Nom] demain mais aucun échange email récent. Voulez-vous préparer un message ?" (type: calendar_insight)',
        '- "3 réunions consécutives demain matin. Voulez-vous bloquer 30 minutes entre chaque ?" (type: calendar_insight)',
        '- "Aucun événement prévu cette semaine avec [contact fréquent]. Normal ?" (type: calendar_insight)',
        '',
        'Réponds en JSON : { "question": "...", "type": "sender_priority|keyword|context|calendar_insight", "sender_email": "si applicable", "sender_name": "si applicable", "options": [...] }',
        'Ou retourne : null',
      ].join('\n'),
    }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return null;
}

/**
 * Analyse un batch de métadonnées d'emails pour extraire des patterns.
 * Retourne un résumé partiel (contacts, projets, ton, sujets).
 */
async function analyzeEmailPatterns(emailMetas) {
  const anthropic = getClient();

  const lines = emailMetas.map((e, i) =>
    `${i + 1}. De: ${e.from} | À: ${e.to} | Objet: ${e.subject} | Date: ${e.date} | Extrait: ${e.snippet}`
  );

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `Tu es un analyste qui extrait des patterns à partir de métadonnées d'emails. Réponds en JSON.`,
    messages: [{
      role: 'user',
      content: `Analyse ces ${emailMetas.length} emails et extrais :
- "contacts_frequents" : les 20 contacts les plus fréquents avec leur relation probable (client, collègue, fournisseur, institution, etc.)
- "projets_actifs" : les projets/sujets récurrents détectés
- "ton_habituel" : comment cette personne communique (formel, cordial, direct, tutoiement vs vouvoiement)
- "signature_habituelle" : comment elle signe ses emails (prénom, nom complet, etc.)
- "domaines_activite" : ses domaines d'activité professionnelle
- "organisations" : entreprises/organismes avec lesquels elle interagit

${lines.join('\n')}

Réponds UNIQUEMENT en JSON valide.`
    }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Si le JSON est tronqué/invalide, retourner le texte brut comme fallback
    console.warn('analyzeEmailPatterns: JSON parse failed, using raw text');
    return { raw_analysis: text.slice(0, 2000) };
  }
}

/**
 * Génère un profil utilisateur complet à partir de patterns extraits de ses emails.
 * Prend les résumés partiels de plusieurs batches et les fusionne en un profil.
 */
export async function generateProfile(batchPatterns, userEmail) {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `Tu génères un profil professionnel complet à partir de patterns extraits d'emails. Le profil servira de contexte pour un assistant IA qui rédigera des réponses au nom de cette personne. Il doit être rédigé à la troisième personne.`,
    messages: [{
      role: 'user',
      content: `Voici les patterns extraits de ~2000 emails de ${userEmail}. Fusionne-les en un profil unique et cohérent.

${JSON.stringify(batchPatterns, null, 2)}

Génère un profil en texte libre (pas JSON) qui inclut :
1. Qui est cette personne (rôle, entreprise, domaine)
2. Ses projets et activités en cours
3. Ses contacts principaux et la nature de la relation
4. Son style de communication (ton, tutoiement/vouvoiement, signature)
5. Les sujets récurrents dans ses emails
6. Toute information utile pour rédiger des réponses en son nom

Sois précis et factuel. Ne spécule pas. Le profil doit faire 300-500 mots.`
    }],
  });

  return response.content[0].text;
}

export { analyzeEmailPatterns };

/**
 * Construit un bloc texte résumant l'agenda de la semaine à partir d'événements calendrier.
 * @param {Array} events — événements normalisés (depuis google-calendar.js listEvents)
 * @returns {string} bloc texte formaté, ou chaîne vide si aucun événement
 */
export function buildCalendarContext(events) {
  if (!events || !events.length) return '';

  const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  // Group events by day (YYYY-MM-DD)
  const byDay = new Map();
  for (const evt of events) {
    let dayKey;
    if (evt.isAllDay) {
      dayKey = evt.start.date; // "2026-03-25"
    } else {
      dayKey = evt.start.dateTime.slice(0, 10);
    }
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(evt);
  }

  // Build a continuous range of days from min to max
  const sortedDays = [...byDay.keys()].sort();
  const startDate = new Date(sortedDays[0] + 'T00:00:00');
  const endDate = new Date(sortedDays[sortedDays.length - 1] + 'T00:00:00');

  const lines = ['--- AGENDA DE LA SEMAINE ---'];
  const current = new Date(startDate);
  while (current <= endDate) {
    const key = current.toISOString().slice(0, 10);
    const dayName = DAYS_FR[current.getDay()];
    const label = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${current.getDate()} ${MONTHS_FR[current.getMonth()]}`;
    const dayEvents = byDay.get(key);

    if (!dayEvents || dayEvents.length === 0) {
      lines.push(`${label} : Aucun événement`);
    } else {
      const parts = dayEvents.map((evt) => {
        if (evt.isAllDay) {
          return `Journée : ${evt.summary}`;
        }
        const startTime = new Date(evt.start.dateTime);
        const endTime = new Date(evt.end.dateTime);
        const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
        return `${fmt(startTime)}-${fmt(endTime)} ${evt.summary}`;
      });
      lines.push(`${label} : ${parts.join(', ')}`);
    }
    current.setDate(current.getDate() + 1);
  }

  return lines.join('\n');
}

/**
 * Envoie un batch d'emails à Claude pour analyse.
 * Retourne le tableau d'analyses parsé.
 * @param {Array} emails
 * @param {Object} config
 * @param {string} [calendarContext] — bloc texte agenda (optionnel)
 */
export async function analyzeEmails(emails, config, calendarContext) {
  if (!emails.length) return [];

  const anthropic = getClient();
  let systemPrompt = buildSystemPrompt(config);

  if (calendarContext) {
    systemPrompt += '\n\n' + calendarContext;
    systemPrompt += '\n\nRÈGLE CALENDRIER : Si un email mentionne une date, un rendez-vous ou une rencontre, vérifie dans l\'agenda ci-dessus s\'il y a déjà un événement correspondant. Si oui, mentionne-le dans le résumé (ex: "Un événement est déjà prévu le..."). Si non, suggère d\'en créer un dans suggested_action (ex: "Proposer un créneau et bloquer dans le calendrier").';
  }

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

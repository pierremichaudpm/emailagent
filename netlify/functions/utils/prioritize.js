/**
 * Combine le score IA de Claude avec les règles de la config utilisateur
 * pour produire un priority_level final.
 */

const LEVELS = { critical: 4, high: 3, normal: 2, low: 1 };

/**
 * Calcule le niveau de priorité final pour un email analysé.
 *
 * @param {object} analysis - Résultat d'analyse Claude pour un email
 * @param {object} email - Email normalisé (from, subject, date, etc.)
 * @param {object} config - Config utilisateur (sender_priorities, keyword_flags, etc.)
 * @returns {object} { priority_level, priority_score, reasons }
 */
export function computePriority(analysis, email, config) {
  let score = analysis.priority_score || 5;
  const reasons = [];

  // 1. Bonus expéditeur prioritaire
  const senderLevel = findSenderPriority(email.from?.email, config.sender_priorities);
  if (senderLevel === 'critical') {
    score = Math.min(10, score + 3);
    reasons.push('expéditeur critique');
  } else if (senderLevel === 'high') {
    score = Math.min(10, score + 2);
    reasons.push('expéditeur important');
  }

  // 2. Bonus mots-clés déclencheurs
  const keywords = config.keyword_flags || [];
  const text = `${email.subject} ${email.snippet || ''}`.toLowerCase();
  const matchedKeywords = keywords.filter((kw) => text.includes(kw.toLowerCase()));
  if (matchedKeywords.length > 0) {
    score = Math.min(10, score + matchedKeywords.length);
    reasons.push(`mots-clés : ${matchedKeywords.join(', ')}`);
  }

  // 3. Bonus montant élevé
  const threshold = config.amount_threshold || 5000;
  const amounts = analysis.amounts || [];
  const highAmounts = amounts.filter((a) => a >= threshold);
  if (highAmounts.length > 0) {
    score = Math.min(10, score + 2);
    reasons.push(`montant ≥ ${threshold} $`);
  }

  // 4. Bonus décision requise
  if (analysis.decision_required) {
    score = Math.min(10, score + 1);
    reasons.push('décision requise');
  }

  // 5. Bonus deadline proche (≤ 3 jours)
  if (analysis.deadline) {
    const deadline = new Date(analysis.deadline);
    const now = new Date();
    const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);
    if (daysUntil <= 3 && daysUntil >= 0) {
      score = Math.min(10, score + 2);
      reasons.push(`deadline dans ${Math.ceil(daysUntil)} jour(s)`);
    } else if (daysUntil < 0) {
      score = Math.min(10, score + 3);
      reasons.push('deadline dépassée');
    }
  }

  // 6. Email stale (en attente depuis trop longtemps)
  const staleDays = config.stale_days || 5;
  const emailAge = (Date.now() - new Date(email.date).getTime()) / (1000 * 60 * 60 * 24);
  if (analysis.decision_required && emailAge >= staleDays) {
    score = Math.min(10, score + 1);
    reasons.push(`en attente depuis ${Math.floor(emailAge)} jours`);
  }

  // Conversion score → level
  const priority_level = scoreToLevel(score);

  return { priority_level, priority_score: score, reasons };
}

function scoreToLevel(score) {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'normal';
  return 'low';
}

function findSenderPriority(email, senderPriorities) {
  if (!email || !senderPriorities) return null;
  const normalized = email.toLowerCase();

  // Match exact
  if (senderPriorities[normalized]) return senderPriorities[normalized];

  // Match par domaine
  const domain = normalized.split('@')[1];
  if (domain && senderPriorities[`@${domain}`]) return senderPriorities[`@${domain}`];

  return null;
}
